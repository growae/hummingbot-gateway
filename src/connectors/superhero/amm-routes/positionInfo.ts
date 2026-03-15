import { FastifyPluginAsync } from 'fastify';

import {
  GetPositionInfoRequestType,
  GetPositionInfoRequest,
  PositionInfo,
  PositionInfoSchema,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Superhero } from '../superhero';
import {
  ACI,
  PairContractApi,
  initializeContractTyped,
} from '../superhero.contracts';
import { fromAettos } from '../superhero.utils';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get position information for a Superhero DEX pool',
        tags: ['/connector/superhero'],
        querystring: GetPositionInfoRequest,
        response: { 200: PositionInfoSchema },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, walletAddress: requestedWalletAddress } = request.query;

        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address is required');
        }

        const superhero = await Superhero.getInstance(network);
        const sdk = superhero.aeternity.sdk;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await superhero.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        const pair = await initializeContractTyped<PairContractApi>(sdk, {
          aci: ACI.Pair,
          address: poolAddress,
        });

        const { decodedResult: lpBalanceRaw } = await pair.balance(walletAddress);
        const lpBalance = BigInt(lpBalanceRaw ?? 0);

        if (lpBalance === 0n) {
          const { decodedResult: token0 } = await pair.token0();
          return {
            poolAddress,
            walletAddress,
            baseTokenAddress: token0,
            quoteTokenAddress: 'unknown',
            lpTokenAmount: 0,
            baseTokenAmount: 0,
            quoteTokenAmount: 0,
            price: 0,
          };
        }

        const { decodedResult: token0 } = await pair.token0();
        const { decodedResult: reserves } = await pair.get_reserves();
        const { decodedResult: totalSupplyRaw } = await pair.total_supply();
        const totalSupply = BigInt(totalSupplyRaw);

        const reserve0 = BigInt(reserves.reserve0);
        const reserve1 = BigInt(reserves.reserve1);

        const userBase = (lpBalance * reserve0) / totalSupply;
        const userQuote = (lpBalance * reserve1) / totalSupply;

        const token0Info = await superhero.getToken(token0);
        const token0Decimals = token0Info?.decimals ?? 18;
        const token1Decimals = 18;

        const baseAmount = fromAettos(userBase, token0Decimals);
        const quoteAmount = fromAettos(userQuote, token1Decimals);
        const lpAmount = fromAettos(lpBalance, 18);

        const baseReserve = fromAettos(reserve0, token0Decimals);
        const quoteReserve = fromAettos(reserve1, token1Decimals);
        const price = baseReserve > 0 ? quoteReserve / baseReserve : 0;

        return {
          poolAddress,
          walletAddress,
          baseTokenAddress: token0,
          quoteTokenAddress: 'unknown',
          lpTokenAmount: lpAmount,
          baseTokenAmount: baseAmount,
          quoteTokenAmount: quoteAmount,
          price,
        };
      } catch (e: any) {
        logger.error(`Error in position-info: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to get position info');
      }
    },
  );
};

export default positionInfoRoute;
