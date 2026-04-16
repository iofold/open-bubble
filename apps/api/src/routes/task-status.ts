import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { PromptTaskManager, TaskStatusResponse } from '../lib/task-manager.js';

interface TaskParams {
  taskId: string;
}

interface NotFoundResponse {
  error: 'not_found';
  message: string;
}

export const taskStatusRoute = ({
  taskManager
}: {
  taskManager: PromptTaskManager;
}): FastifyPluginAsync => {
  const route: FastifyPluginAsync = async (app) => {
    app.get<{ Params: TaskParams }>(
      '/tasks/:taskId',
      async (request, reply): Promise<TaskStatusResponse | FastifyReply> => {
        const task = await taskManager.getTask(request.params.taskId);

        if (task) {
          return task;
        }

        const payload: NotFoundResponse = {
          error: 'not_found',
          message: `Task ${request.params.taskId} was not found.`
        };

        return reply.code(404).send(payload);
      }
    );
  };

  return route;
};
