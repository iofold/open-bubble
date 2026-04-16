import fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoute } from './routes/health.js';
import { promptRoute } from './routes/prompt.js';
import { openApiExists, resolveOpenApiPath } from './lib/openapi.js';

export const serviceVersion = '0.1.0';

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = fastify({
    logger: false
  });

  await app.register(multipart);

  if (openApiExists()) {
    await app.register(swagger, {
      mode: 'static',
      specification: {
        path: resolveOpenApiPath(),
        baseDir: '/'
      }
    });

    await app.register(swaggerUi, {
      routePrefix: '/documentation'
    });

    app.get('/openapi.json', async () => app.swagger());
  }

  await app.register(healthRoute({ serviceVersion }));
  await app.register(promptRoute);

  return app;
};
