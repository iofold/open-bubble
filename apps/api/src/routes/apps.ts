import type { FastifyPluginAsync } from 'fastify';
import { supportedApps } from '../lib/supported-apps.js';

export interface AppsResponse {
  apps: typeof supportedApps;
}

export const appsRoute = (): FastifyPluginAsync => {
  const route: FastifyPluginAsync = async (app) => {
    app.get('/apps', async (): Promise<AppsResponse> => ({
      apps: supportedApps
    }));
  };

  return route;
};
