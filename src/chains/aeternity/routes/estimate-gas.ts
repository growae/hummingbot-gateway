import { FastifyPluginAsync } from 'fastify';

import { EstimateGasResponse, EstimateGasResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { AeternityStatusRequest } from '../schemas';
import { Aeternity } from '../aeternity';

const AE_MIN_GAS_PRICE = 1_000_000_000;
const AE_DEFAULT_GAS = 16_660;

export async function estimateGasAeternity(network: string): Promise<EstimateGasResponse> {
  try {
    const aeternity = await Aeternity.getInstance(network);
    const nativeSymbol = aeternity.nativeTokenSymbol;

    const feeInAettos = AE_MIN_GAS_PRICE * AE_DEFAULT_GAS;
    const feeInAe = feeInAettos / 1e18;

    return {
      feePerComputeUnit: AE_MIN_GAS_PRICE,
      denomination: 'aettos',
      computeUnits: AE_DEFAULT_GAS,
      feeAsset: nativeSymbol,
      fee: feeInAe,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    logger.error(`Error estimating gas for Aeternity ${network}: ${error.message}`);
    return {
      feePerComputeUnit: AE_MIN_GAS_PRICE,
      denomination: 'aettos',
      computeUnits: AE_DEFAULT_GAS,
      feeAsset: 'AE',
      fee: (AE_MIN_GAS_PRICE * AE_DEFAULT_GAS) / 1e18,
      timestamp: Date.now(),
    };
  }
}

export const estimateGasRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network?: string };
    Reply: EstimateGasResponse;
  }>(
    '/estimate-gas',
    {
      schema: {
        description: 'Estimate transaction fees for Aeternity network.',
        tags: ['/chain/aeternity'],
        querystring: AeternityStatusRequest,
        response: { 200: EstimateGasResponseSchema },
      },
    },
    async (request) => {
      const network = request.query.network || 'mainnet';
      return await estimateGasAeternity(network);
    },
  );
};

export default estimateGasRoute;
