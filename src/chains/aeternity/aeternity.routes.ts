import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './routes/balances';
import { pollRoute } from './routes/poll';
import { statusRoute } from './routes/status';

export const aeternityRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  fastify.register(statusRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
};

export default aeternityRoutes;
