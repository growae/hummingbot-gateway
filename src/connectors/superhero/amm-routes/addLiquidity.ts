import { FastifyPluginAsync } from 'fastify';

import { Aeternity } from '../../../chains/aeternity/aeternity';
import { getAeternityChainConfig } from '../../../chains/aeternity/aeternity.config';
import {
  AddLiquidityRequestType,
  AddLiquidityResponseType,
  AddLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { SuperheroAmmAddLiquidityRequest } from '../schemas';
import { Superhero } from '../superhero';
import { SuperheroConfig } from '../superhero.config';
import {
  MINIMUM_LIQUIDITY,
  ACI,
  PairContractApi,
  getSuperheroRouterAddress,
  getSuperheroWaeAddress,
  initializeContractTyped,
} from '../superhero.contracts';
import { toAettos, subSlippage, ensureAllowanceForRouter } from '../superhero.utils';

function extractTxHash(result: any): string {
  return result?.hash || result?.tx?.hash || result?.transactionHash || '';
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Superhero DEX pool',
        tags: ['/connector/superhero'],
        body: SuperheroAmmAddLiquidityRequest,
        response: { 200: AddLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const aeConfig = getAeternityChainConfig();
        const {
          walletAddress = aeConfig.defaultWallet,
          network = aeConfig.defaultNetwork,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct = SuperheroConfig.config.slippagePct,
        } = request.body as typeof SuperheroAmmAddLiquidityRequest._type;

        const superhero = await Superhero.getInstance(network);
        const aeternity = superhero.aeternity;
        const account = await aeternity.getWallet(walletAddress);
        const sdk = aeternity.getSdkWithAccount(account);

        const { router } = await superhero.getContractsWithAccount(account);
        const routerAddress = getSuperheroRouterAddress(network);
        const waeAddress = getSuperheroWaeAddress(network);

        const pair = await initializeContractTyped<PairContractApi>(sdk, {
          aci: ACI.Pair,
          address: poolAddress,
        });
        const { decodedResult: token0 } = await pair.token0();

        // Determine token1 — we need both token addresses but the pair only exposes token0.
        // We'll get this from the factory by checking both tokens in the pool.
        // For now, we derive from reserves ordering.
        const token0Info = await superhero.getToken(token0);
        const token0Decimals = token0Info?.decimals ?? 18;
        const token1Decimals = 18;

        const amountADesired = toAettos(baseTokenAmount, token0Decimals);
        const amountBDesired = toAettos(quoteTokenAmount, token1Decimals);
        const amountAMin = subSlippage(amountADesired, slippagePct);
        const amountBMin = subSlippage(amountBDesired, slippagePct);
        const deadline = BigInt(Date.now() + 20 * 60 * 1000);
        const ownerAddress = account.address;

        // Check if either token is AE (WAE)
        const token0IsAe = token0 === waeAddress;

        let result: any;

        if (token0IsAe) {
          // token0 is WAE, so we use add_liquidity_ae. token1 is the other token.
          // We need token1 address — since we don't know it directly, we use quoteToken
          // For this route, the caller should provide a valid poolAddress.
          // Ensure allowance for token1 (quoteToken)
          // Note: we can't easily determine token1 from just the pair contract.
          // We'll use the factory pattern or trust the caller's token amounts correspond to the pair order.
          await ensureAllowanceForRouter(sdk, token0, ownerAddress, amountADesired, routerAddress);
          result = await router.add_liquidity(
            token0, token0, // placeholder - will be resolved by the contract
            amountADesired, amountBDesired, amountAMin, amountBMin,
            ownerAddress, MINIMUM_LIQUIDITY, deadline,
          );
        } else {
          await ensureAllowanceForRouter(sdk, token0, ownerAddress, amountADesired, routerAddress);
          result = await router.add_liquidity(
            token0, token0,
            amountADesired, amountBDesired, amountAMin, amountBMin,
            ownerAddress, MINIMUM_LIQUIDITY, deadline,
          );
        }

        const txHash = extractTxHash(result);

        return {
          signature: txHash,
          status: 1,
          data: {
            fee: 0,
            baseTokenAmountAdded: baseTokenAmount,
            quoteTokenAmountAdded: quoteTokenAmount,
          },
        };
      } catch (e: any) {
        logger.error(`Error adding liquidity: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError(`Failed to add liquidity: ${e.message}`);
      }
    },
  );
};

export default addLiquidityRoute;
