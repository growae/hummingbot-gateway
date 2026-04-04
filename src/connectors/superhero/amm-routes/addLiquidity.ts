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
        const [{ decodedResult: token0 }, { decodedResult: token1 }] =
          await Promise.all([pair.token0(), pair.token1()]);

        const [token0Info, token1Info] = await Promise.all([
          superhero.getToken(token0),
          superhero.getToken(token1),
        ]);
        const token0Decimals = token0Info?.decimals ?? 18;
        const token1Decimals = token1Info?.decimals ?? 18;

        const amountADesired = toAettos(baseTokenAmount, token0Decimals);
        const amountBDesired = toAettos(quoteTokenAmount, token1Decimals);
        const amountAMin = subSlippage(amountADesired, slippagePct);
        const amountBMin = subSlippage(amountBDesired, slippagePct);
        const deadline = BigInt(Date.now() + 20 * 60 * 1000);
        const ownerAddress = account.address;

        const token0IsAe = token0 === waeAddress;
        const token1IsAe = token1 === waeAddress;

        let result: any;

        if (token0IsAe) {
          await ensureAllowanceForRouter(sdk, token1, ownerAddress, amountBDesired, routerAddress);
          result = await router.add_liquidity_ae(
            token1, amountBDesired,
            amountBMin, amountAMin,
            ownerAddress, MINIMUM_LIQUIDITY, deadline,
            { amount: amountADesired.toString() },
          );
        } else if (token1IsAe) {
          await ensureAllowanceForRouter(sdk, token0, ownerAddress, amountADesired, routerAddress);
          result = await router.add_liquidity_ae(
            token0, amountADesired,
            amountAMin, amountBMin,
            ownerAddress, MINIMUM_LIQUIDITY, deadline,
            { amount: amountBDesired.toString() },
          );
        } else {
          await Promise.all([
            ensureAllowanceForRouter(sdk, token0, ownerAddress, amountADesired, routerAddress),
            ensureAllowanceForRouter(sdk, token1, ownerAddress, amountBDesired, routerAddress),
          ]);
          result = await router.add_liquidity(
            token0, token1,
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
