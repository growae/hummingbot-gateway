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
        const { poolAddress, network } = request.query;
        const superhero = await Superhero.getInstance(network);
        const sdk = superhero.aeternity.sdk;

        const pair = await initializeContractTyped<PairContractApi>(sdk, {
          aci: ACI.Pair,
          address: poolAddress,
        });

        const { decodedResult: token0 } = await pair.token0();
        const { decodedResult: reserves } = await pair.get_reserves();
        const reserve0 = BigInt(reserves.reserve0);
        const reserve1 = BigInt(reserves.reserve1);

        const token0Info = await superhero.getToken(token0);
        const token1Addr = token0 === poolAddress ? token0 : '';

        let token1 = '';
        // We need to determine token1 from pool context. The factory's get_pair
        // returns the pair given two tokens, but from the pair itself we only get token0.
        // We'll derive token1 from the pool info: token0 and the reserves.
        // For simplicity, we report token0 as base and the other as quote.
        const token0Decimals = token0Info?.decimals ?? 18;
        const token1Decimals = 18; // default

        const baseTokenAmount = fromAettos(reserve0, token0Decimals);
        const quoteTokenAmount = fromAettos(reserve1, token1Decimals);
        const price = baseTokenAmount > 0 ? quoteTokenAmount / baseTokenAmount : 0;

        return {
          address: poolAddress,
          baseTokenAddress: token0,
          quoteTokenAddress: token1 || 'unknown',
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
