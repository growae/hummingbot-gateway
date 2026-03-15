import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { SuperheroAmmGetPoolInfoRequest } from '../schemas';
import { Superhero } from '../superhero';
import {
  ACI,
  PairContractApi,
  initializeContractTyped,
} from '../superhero.contracts';
import { fromAettos } from '../superhero.utils';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Superhero DEX',
        tags: ['/connector/superhero'],
        querystring: SuperheroAmmGetPoolInfoRequest,
        response: { 200: PoolInfoSchema },
      },
    },
    async (request) => {
      try {
        const { poolAddress, network = 'mainnet' } = request.query;
        const superhero = await Superhero.getInstance(network);
        const sdk = superhero.aeternity.sdk;

        const pair = await initializeContractTyped<PairContractApi>(sdk, {
          aci: ACI.Pair,
          address: poolAddress,
        });

        const [{ decodedResult: token0 }, { decodedResult: token1 }, { decodedResult: reserves }] =
          await Promise.all([pair.token0(), pair.token1(), pair.get_reserves()]);

        const reserve0 = BigInt(reserves.reserve0);
        const reserve1 = BigInt(reserves.reserve1);

        const [token0Info, token1Info] = await Promise.all([
          superhero.getToken(token0),
          superhero.getToken(token1),
        ]);

        const token0Decimals = token0Info?.decimals ?? 18;
        const token1Decimals = token1Info?.decimals ?? 18;

        const baseTokenAmount = fromAettos(reserve0, token0Decimals);
        const quoteTokenAmount = fromAettos(reserve1, token1Decimals);
        const price = baseTokenAmount > 0 ? quoteTokenAmount / baseTokenAmount : 0;

        return {
          address: poolAddress,
          baseTokenAddress: token0,
          quoteTokenAddress: token1,
          feePct: 0.3,
          price,
          baseTokenAmount,
          quoteTokenAmount,
        };
      } catch (e: any) {
        logger.error(`Error in pool-info route: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;
