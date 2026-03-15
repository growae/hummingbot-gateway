import { FastifyPluginAsync } from 'fastify';

import { BalanceRequestType, BalanceResponseType, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Aeternity } from '../aeternity';
import { AeternityBalanceRequest } from '../schemas';

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description:
          'Get Aeternity balances. Returns native AE balance and optionally AEX9 token balances.',
        tags: ['/chain/aeternity'],
        body: AeternityBalanceRequest,
        response: {
          200: BalanceResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, tokens } = request.body;
      try {
        const aeternity = await Aeternity.getInstance(network);
        const balances = await aeternity.getBalances(address, tokens);
        return { balances };
      } catch (error: any) {
        logger.error(`Error getting Aeternity balances: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
      }
    },
  );
};

export default balancesRoute;
