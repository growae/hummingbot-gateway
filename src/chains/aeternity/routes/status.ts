import { FastifyPluginAsync } from 'fastify';

import { StatusRequestType, StatusResponseType, StatusResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Aeternity } from '../aeternity';
import { AeternityStatusRequest } from '../schemas';

export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: StatusRequestType;
    Reply: StatusResponseType;
  }>(
    '/status',
    {
      schema: {
        description: 'Get Aeternity chain status',
        tags: ['/chain/aeternity'],
        querystring: AeternityStatusRequest,
        response: {
          200: StatusResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { network } = request.query;
      try {
        const aeternity = await Aeternity.getInstance(network);
        let currentBlockNumber = 0;
        try {
          currentBlockNumber = await aeternity.getCurrentHeight();
        } catch (blockError: any) {
          logger.warn(`Failed to get block height: ${blockError.message}`);
        }

        return {
          chain: 'aeternity',
          network,
          rpcUrl: aeternity.nodeUrl,
          rpcProvider: 'url',
          currentBlockNumber,
          nativeCurrency: aeternity.nativeTokenSymbol,
          swapProvider: aeternity.swapProvider,
        };
      } catch (error: any) {
        logger.error(`Error in Aeternity status endpoint: ${error.message}`);
        reply.status(500);
        return {
          chain: 'aeternity',
          network,
          rpcUrl: 'unavailable',
          rpcProvider: 'unavailable',
          currentBlockNumber: 0,
          nativeCurrency: 'AE',
          swapProvider: '',
        };
      }
    },
  );
};

export default statusRoute;
