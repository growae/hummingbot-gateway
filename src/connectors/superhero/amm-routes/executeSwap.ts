import { FastifyPluginAsync } from 'fastify';

import { Aeternity } from '../../../chains/aeternity/aeternity';
import { getAeternityChainConfig } from '../../../chains/aeternity/aeternity.config';
import {
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { SuperheroAmmExecuteSwapRequest } from '../schemas';
import { Superhero } from '../superhero';
import { SuperheroConfig } from '../superhero.config';
import { getSuperheroRouterAddress, getSuperheroWaeAddress } from '../superhero.contracts';
import { toAettos, fromAettos, subSlippage, addSlippage, ensureAllowanceForRouter } from '../superhero.utils';

function extractTxHash(result: any): string {
  return result?.hash || result?.tx?.hash || result?.transactionHash || '';
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Superhero DEX AMM',
        tags: ['/connector/superhero'],
        body: SuperheroAmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const aeConfig = getAeternityChainConfig();
        const {
          walletAddress = aeConfig.defaultWallet,
          network = aeConfig.defaultNetwork,
          baseToken,
          quoteToken,
          amount,
          side = 'SELL',
          slippagePct = SuperheroConfig.config.slippagePct,
        } = request.body as typeof SuperheroAmmExecuteSwapRequest._type;

        const superhero = await Superhero.getInstance(network);
        const aeternity = superhero.aeternity;
        const account = await aeternity.getWallet(walletAddress);
        const sdk = aeternity.getSdkWithAccount(account);

        const { router } = await superhero.getContractsWithAccount(account);
        const routerAddress = getSuperheroRouterAddress(network);
        const waeAddress = getSuperheroWaeAddress(network);

        const baseTokenInfo = await superhero.getToken(baseToken);
        const quoteTokenInfo = await superhero.getToken(quoteToken || '');
        if (!baseTokenInfo) throw fastify.httpErrors.badRequest(`Base token not found: ${baseToken}`);
        if (!quoteTokenInfo) throw fastify.httpErrors.badRequest(`Quote token not found: ${quoteToken}`);

        const baseAddr = superhero.resolveTokenAddress(baseToken);
        const quoteAddr = superhero.resolveTokenAddress(quoteToken || '');
        const exactIn = side === 'SELL';
        const path = exactIn ? [baseAddr, quoteAddr] : [quoteAddr, baseAddr];

        const baseIsAe = superhero.isNativeAe(baseToken);
        const quoteIsAe = superhero.isNativeAe(quoteToken || '');

        const deadline = BigInt(Date.now() + 20 * 60 * 1000);
        const ownerAddress = account.address;
        let result: any;
        let amountIn: number;
        let amountOut: number;

        if (exactIn) {
          const rawAmountIn = toAettos(amount, baseTokenInfo.decimals);
          const { decodedResult: amounts } = await router.get_amounts_out(rawAmountIn, path);
          const rawAmountOut = BigInt(amounts[amounts.length - 1]);
          const rawMinOut = subSlippage(rawAmountOut, slippagePct);

          amountIn = amount;
          amountOut = fromAettos(rawAmountOut, quoteTokenInfo.decimals);

          if (baseIsAe) {
            result = await router.swap_exact_ae_for_tokens(
              rawMinOut, path, ownerAddress, deadline, null,
              { amount: rawAmountIn },
            );
          } else if (quoteIsAe) {
            await ensureAllowanceForRouter(sdk, baseAddr, ownerAddress, rawAmountIn, routerAddress);
            result = await router.swap_exact_tokens_for_ae(
              rawAmountIn, rawMinOut, path, ownerAddress, deadline, null,
            );
          } else {
            await ensureAllowanceForRouter(sdk, baseAddr, ownerAddress, rawAmountIn, routerAddress);
            result = await router.swap_exact_tokens_for_tokens(
              rawAmountIn, rawMinOut, path, ownerAddress, deadline, null,
            );
          }
        } else {
          const rawAmountOut = toAettos(amount, baseTokenInfo.decimals);
          const { decodedResult: amounts } = await router.get_amounts_in(rawAmountOut, path);
          const rawAmountIn = BigInt(amounts[0]);
          const rawMaxIn = addSlippage(rawAmountIn, slippagePct);

          amountIn = fromAettos(rawAmountIn, quoteTokenInfo.decimals);
          amountOut = amount;

          if (quoteIsAe) {
            result = await router.swap_ae_for_exact_tokens(
              rawAmountOut, path, ownerAddress, deadline, null,
              { amount: rawMaxIn },
            );
          } else if (baseIsAe) {
            await ensureAllowanceForRouter(sdk, quoteAddr, ownerAddress, rawMaxIn, routerAddress);
            result = await router.swap_tokens_for_exact_ae(
              rawAmountOut, rawMaxIn, path, ownerAddress, deadline, null,
            );
          } else {
            await ensureAllowanceForRouter(sdk, quoteAddr, ownerAddress, rawMaxIn, routerAddress);
            result = await router.swap_tokens_for_exact_tokens(
              rawAmountOut, rawMaxIn, path, ownerAddress, deadline, null,
            );
          }
        }

        const txHash = extractTxHash(result);
        const baseChange = side === 'SELL' ? -amountIn : amountOut;
        const quoteChange = side === 'SELL' ? amountOut : -amountIn;

        return {
          signature: txHash,
          status: 1,
          data: {
            tokenIn: exactIn ? baseAddr : quoteAddr,
            tokenOut: exactIn ? quoteAddr : baseAddr,
            amountIn,
            amountOut,
            fee: 0,
            baseTokenBalanceChange: baseChange,
            quoteTokenBalanceChange: quoteChange,
          },
        };
      } catch (e: any) {
        logger.error(`Error executing swap: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError(`Failed to execute swap: ${e.message}`);
      }
    },
  );
};

export default executeSwapRoute;
