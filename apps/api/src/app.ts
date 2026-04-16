import fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadRepoEnv } from './lib/env.js';
import { healthRoute } from './routes/health.js';
import { appsRoute } from './routes/apps.js';
import {
  type PromptTaskManagerOptions,
  PromptTaskManager
} from './lib/task-manager.js';
import { promptRoute } from './routes/prompt.js';
import { taskStatusRoute } from './routes/task-status.js';
import {
  contextGraphRoute,
  type ContextGraphRouteOptions
} from './routes/context-graph.js';
import { openApiExists, resolveOpenApiPath } from './lib/openapi.js';
import { createClassifierPromptTaskProcessor } from './lib/request-classifier.js';

export const serviceVersion = '0.1.0';

export interface BuildAppOptions
  extends PromptTaskManagerOptions,
    ContextGraphRouteOptions {}

export const buildApp = async (
  options: BuildAppOptions = {}
): Promise<FastifyInstance> => {
  loadRepoEnv();

  const app = fastify({
    logger: false
  });
  const taskManager = await PromptTaskManager.create({
    ...options,
    taskProcessor: options.taskProcessor ?? createClassifierPromptTaskProcessor()
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
  await app.register(appsRoute());
  const contextGraphOptions: ContextGraphRouteOptions = {};
  if (options.store) {
    contextGraphOptions.store = options.store;
  }
  if (options.mcpToolClient) {
    contextGraphOptions.mcpToolClient = options.mcpToolClient;
  }

  await app.register(contextGraphRoute(contextGraphOptions));
  await app.register(promptRoute({ taskManager }));
  await app.register(taskStatusRoute({ taskManager }));

  return app;
};
