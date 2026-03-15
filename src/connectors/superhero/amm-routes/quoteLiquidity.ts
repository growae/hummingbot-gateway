import { FastifyPluginAsync } from 'fastify';

import {
  QuoteLiquidityRequestType,
  QuoteLiquidityRequest,
  QuoteLiquidityResponseType,
  QuoteLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Superhero } from '../superhero';
import {
  ACI,
  PairContractApi,
  initializeContractTyped,
} from '../superhero.contracts';
import { toAettos, fromAettos } from '../superhero.utils';

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get liquidity quote for a Superhero DEX pool',
        tags: ['/connector/superhero'],
        querystring: QuoteLiquidityRequest,
        response: { 200: QuoteLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseTokenAmount, quoteTokenAmount } = request.query;

        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address is required');
        }

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

        let baseTokenAmountOptimal = baseTokenAmount;
        let quoteTokenAmountOptimal = quoteTokenAmount;
        let baseLimited = false;

        if (reserve0 > 0n && reserve1 > 0n) {
          const baseRaw = baseTokenAmount
            ? toAettos(baseTokenAmount, token0Decimals)
            : null;
          const quoteRaw = quoteTokenAmount
            ? toAettos(quoteTokenAmount, token1Decimals)
            : null;

          if (baseRaw && quoteRaw) {
            const quoteOptimal = (baseRaw * reserve1) / reserve0;
            if (quoteOptimal <= quoteRaw) {
              baseLimited = true;
              quoteTokenAmountOptimal = fromAettos(quoteOptimal, token1Decimals);
            } else {
              baseLimited = false;
              const baseOptimal = (quoteRaw * reserve0) / reserve1;
              baseTokenAmountOptimal = fromAettos(baseOptimal, token0Decimals);
            }
          } else if (baseRaw) {
            const quoteOptimal = reserve0 === 0n ? 0n : (baseRaw * reserve1) / reserve0;
            quoteTokenAmountOptimal = fromAettos(quoteOptimal, token1Decimals);
            baseLimited = true;
          } else if (quoteRaw) {
            const baseOptimal = reserve1 === 0n ? 0n : (quoteRaw * reserve0) / reserve1;
            baseTokenAmountOptimal = fromAettos(baseOptimal, token0Decimals);
            baseLimited = false;
          }
        } else {
          if (baseTokenAmount && quoteTokenAmount) {
            baseLimited = false;
          } else {
            throw fastify.httpErrors.badRequest('For new pools, both base and quote token amounts must be provided');
          }
        }

        return {
          baseLimited,
          baseTokenAmount: baseTokenAmountOptimal ?? 0,
          quoteTokenAmount: quoteTokenAmountOptimal ?? 0,
          baseTokenAmountMax: baseTokenAmount || baseTokenAmountOptimal || 0,
          quoteTokenAmountMax: quoteTokenAmount || quoteTokenAmountOptimal || 0,
        };
      } catch (e: any) {
        logger.error(`Error in quote-liquidity: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to get liquidity quote');
      }
    },
  );
};

export default quoteLiquidityRoute;
