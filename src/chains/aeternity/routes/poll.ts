import { FastifyPluginAsync } from 'fastify';

import { PollRequestType, PollResponseType, PollResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Aeternity } from '../aeternity';
import { AeternityPollRequest } from '../schemas';

export const pollRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PollRequestType;
    Reply: PollResponseType;
  }>(
    '/poll',
    {
      schema: {
        description: 'Poll Aeternity transaction status',
        tags: ['/chain/aeternity'],
        body: AeternityPollRequest,
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature } = request.body;
      try {
        const aeternity = await Aeternity.getInstance(network);
        const currentBlock = await aeternity.getCurrentHeight();
        const txData = await aeternity.getTransaction(signature);

        if (!txData) {
          return {
            currentBlock,
            signature,
            txBlock: null,
            txStatus: -1,
            fee: null,
            txData: null,
          };
        }

        const txBlock = txData.blockHeight ?? null;
        const txStatus = txBlock && txBlock > 0 ? 1 : 0;

        return {
          currentBlock,
          signature,
          txBlock,
          txStatus,
          fee: null,
          txData,
        };
      } catch (error: any) {
        logger.error(`Error polling Aeternity transaction: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to poll transaction: ${error.message}`);
      }
    },
  );
};

export default pollRoute;
