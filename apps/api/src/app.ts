import fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoute } from './routes/health.js';
import { appsRoute } from './routes/apps.js';
import {
  type PromptTaskProcessor,
  type PromptTaskManagerOptions,
  PromptTaskManager
} from './lib/task-manager.js';
import { promptRoute } from './routes/prompt.js';
import { taskStatusRoute } from './routes/task-status.js';
import { contextGraphRoute } from './routes/context-graph.js';
import { openApiExists, resolveOpenApiPath } from './lib/openapi.js';

export const serviceVersion = '0.1.0';

export interface BuildAppOptions extends PromptTaskManagerOptions {}

let defaultTaskProcessorPromise: Promise<PromptTaskProcessor> | undefined;

const getDefaultTaskProcessor = async (): Promise<PromptTaskProcessor> => {
  defaultTaskProcessorPromise ??= import('@open-bubble/codex-app-server')
    .then((module) => module.createConfiguredPromptTaskProcessor());

  return defaultTaskProcessorPromise;
};

export const buildApp = async (
  options: BuildAppOptions = {}
): Promise<FastifyInstance> => {
  const app = fastify({
    logger: false
  });
  const taskManager = await PromptTaskManager.create({
    ...options,
    taskProcessor: options.taskProcessor ?? await getDefaultTaskProcessor()
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
  await app.register(contextGraphRoute());
  await app.register(promptRoute({ taskManager }));
  await app.register(taskStatusRoute({ taskManager }));

  return app;
};
