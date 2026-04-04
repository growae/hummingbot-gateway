import { FastifyPluginAsync } from 'fastify';

import { Aeternity } from '../../../chains/aeternity/aeternity';
import { getAeternityChainConfig } from '../../../chains/aeternity/aeternity.config';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { SuperheroAmmRemoveLiquidityRequest } from '../schemas';
import { Superhero } from '../superhero';
import { SuperheroConfig } from '../superhero.config';
import {
  ACI,
  PairContractApi,
  getSuperheroRouterAddress,
  getSuperheroWaeAddress,
  initializeContractTyped,
} from '../superhero.contracts';
import {
  fromAettos,
  ensurePairAllowanceForRouter,
  estimateRemovalMinimums,
} from '../superhero.utils';

function extractTxHash(result: any): string {
  return result?.hash || result?.tx?.hash || result?.transactionHash || '';
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Superhero DEX pool',
        tags: ['/connector/superhero'],
        body: SuperheroAmmRemoveLiquidityRequest,
        response: { 200: RemoveLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const aeConfig = getAeternityChainConfig();
        const {
          walletAddress = aeConfig.defaultWallet,
          network = aeConfig.defaultNetwork,
          poolAddress,
          percentageToRemove,
        } = request.body as typeof SuperheroAmmRemoveLiquidityRequest._type;

        const slippagePct = SuperheroConfig.config.slippagePct;
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

        const { decodedResult: lpBalanceRaw } = await pair.balance(walletAddress);
        const lpBalance = BigInt(lpBalanceRaw ?? 0);

        if (lpBalance === 0n) {
          throw fastify.httpErrors.badRequest('No LP tokens to remove');
        }

        const lpToBurn = (lpBalance * BigInt(Math.round(percentageToRemove * 100))) / 10000n;
        if (lpToBurn === 0n) {
          throw fastify.httpErrors.badRequest('Calculated LP amount to burn is zero');
        }

        const [
          { decodedResult: token0 },
          { decodedResult: token1 },
          { decodedResult: reserves },
          { decodedResult: totalSupplyRaw },
        ] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.get_reserves(),
          pair.total_supply(),
        ]);
        const totalSupply = BigInt(totalSupplyRaw);
        const reserve0 = BigInt(reserves.reserve0);
        const reserve1 = BigInt(reserves.reserve1);

        const { minA, minB } = estimateRemovalMinimums(reserve0, reserve1, totalSupply, lpToBurn, slippagePct);

        await ensurePairAllowanceForRouter(sdk, poolAddress, walletAddress, lpToBurn, routerAddress);

        const deadline = BigInt(Date.now() + 20 * 60 * 1000);
        const ownerAddress = account.address;

        const token0IsAe = token0 === waeAddress;
        const token1IsAe = token1 === waeAddress;

        let result: any;
        if (token0IsAe) {
          result = await router.remove_liquidity_ae(
            token1, lpToBurn, minB, minA, ownerAddress, deadline,
          );
        } else if (token1IsAe) {
          result = await router.remove_liquidity_ae(
            token0, lpToBurn, minA, minB, ownerAddress, deadline,
          );
        } else {
          result = await router.remove_liquidity(
            token0, token1, lpToBurn, minA, minB, ownerAddress, deadline,
          );
        }

        const txHash = extractTxHash(result);

        const [token0Info, token1Info] = await Promise.all([
          superhero.getToken(token0),
          superhero.getToken(token1),
        ]);
        const token0Decimals = token0Info?.decimals ?? 18;
        const token1Decimals = token1Info?.decimals ?? 18;

        const expectedA = (lpToBurn * reserve0) / totalSupply;
        const expectedB = (lpToBurn * reserve1) / totalSupply;

        return {
          signature: txHash,
          status: 1,
          data: {
            fee: 0,
            baseTokenAmountRemoved: fromAettos(expectedA, token0Decimals),
            quoteTokenAmountRemoved: fromAettos(expectedB, token1Decimals),
          },
        };
      } catch (e: any) {
        logger.error(`Error removing liquidity: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError(`Failed to remove liquidity: ${e.message}`);
      }
    },
  );
};

export default removeLiquidityRoute;
