import { FastifyPluginAsync } from 'fastify';

import {
  QuoteSwapRequestType,
  QuoteSwapResponseType,
  QuoteSwapResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { SuperheroAmmQuoteSwapRequest } from '../schemas';
import { Superhero } from '../superhero';
import { SuperheroConfig } from '../superhero.config';
import { getSuperheroWaeAddress } from '../superhero.contracts';
import { toAettos, fromAettos, subSlippage, addSlippage } from '../superhero.utils';

export async function getSuperheroAmmQuote(
  network: string,
  poolAddress: string | undefined,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = SuperheroConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  const superhero = await Superhero.getInstance(network);

  const baseTokenInfo = await superhero.getToken(baseToken);
  const quoteTokenInfo = await superhero.getToken(quoteToken);
  if (!baseTokenInfo) throw new Error(`Base token not found: ${baseToken}`);
  if (!quoteTokenInfo) throw new Error(`Quote token not found: ${quoteToken}`);

  const baseAddr = superhero.resolveTokenAddress(baseToken);
  const quoteAddr = superhero.resolveTokenAddress(quoteToken);

  const pool = await superhero.getPool(baseAddr, quoteAddr);
  if (!pool) throw new Error(`No pool found for ${baseToken}-${quoteToken}`);

  const poolAddr = poolAddress || pool.pairAddress;

  const isBaseToken0 = pool.token0 === baseAddr;
  const baseReserve = isBaseToken0 ? pool.reserve0 : pool.reserve1;
  const quoteReserve = isBaseToken0 ? pool.reserve1 : pool.reserve0;

  const { router } = await superhero.getContracts();
  const exactIn = side === 'SELL';
  const path = exactIn ? [baseAddr, quoteAddr] : [quoteAddr, baseAddr];

  let amountIn: number;
  let amountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;

  if (exactIn) {
    const rawAmountIn = toAettos(amount, baseTokenInfo.decimals);
    const { decodedResult: amounts } = await router.get_amounts_out(rawAmountIn, path);
    const rawAmountOut = BigInt(amounts[amounts.length - 1]);

    amountIn = amount;
    amountOut = fromAettos(rawAmountOut, quoteTokenInfo.decimals);
    minAmountOut = fromAettos(subSlippage(rawAmountOut, slippagePct), quoteTokenInfo.decimals);
    maxAmountIn = amount;
  } else {
    const rawAmountOut = toAettos(amount, baseTokenInfo.decimals);
    const { decodedResult: amounts } = await router.get_amounts_in(rawAmountOut, path);
    const rawAmountIn = BigInt(amounts[0]);

    amountIn = fromAettos(rawAmountIn, quoteTokenInfo.decimals);
    amountOut = amount;
    minAmountOut = amount;
    maxAmountIn = fromAettos(addSlippage(rawAmountIn, slippagePct), quoteTokenInfo.decimals);
  }

  const price = amountOut / amountIn;

  const midPrice = Number(quoteReserve) / Number(baseReserve);
  const executionPrice = exactIn ? amountOut / amountIn : amountIn / amountOut;
  const priceImpactPct = Math.abs((executionPrice - midPrice) / midPrice) * 100;

  return {
    poolAddress: poolAddr,
    tokenIn: exactIn ? baseAddr : quoteAddr,
    tokenOut: exactIn ? quoteAddr : baseAddr,
    amountIn,
    amountOut,
    price,
    slippagePct,
    minAmountOut,
    maxAmountIn,
    priceImpactPct,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Superhero DEX AMM',
        tags: ['/connector/superhero'],
        querystring: SuperheroAmmQuoteSwapRequest,
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet', poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;

        if (!baseToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('baseToken, amount, and side are required');
        }
        if (!quoteToken && !poolAddress) {
          throw fastify.httpErrors.badRequest('quoteToken is required when poolAddress is not provided');
        }

        return await getSuperheroAmmQuote(
          network,
          poolAddress,
          baseToken,
          quoteToken || '',
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e: any) {
        logger.error(`Error in quote-swap route: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError(e.message || 'Error getting swap quote');
      }
    },
  );
};

export default quoteSwapRoute;
