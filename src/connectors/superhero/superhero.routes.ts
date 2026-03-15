import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { superheroAmmRoutes } from './amm-routes';

const superheroAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/superhero'];
      }
    });

    await instance.register(superheroAmmRoutes);
  });
};

export const superheroRoutes = {
  amm: superheroAmmRoutesWrapper,
};

export default superheroRoutes;
