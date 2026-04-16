import type { FastifyPluginAsync } from 'fastify';

export interface HealthResponse {
  ok: true;
  service: 'open-bubble-api';
  version: string;
}

export interface HealthRouteOptions {
  serviceVersion: string;
}

export const healthRoute = ({
  serviceVersion
}: HealthRouteOptions): FastifyPluginAsync => {
  const route: FastifyPluginAsync = async (app) => {
    app.get('/health', async (): Promise<HealthResponse> => ({
      ok: true,
      service: 'open-bubble-api',
      version: serviceVersion
    }));
  };

  return route;
};
