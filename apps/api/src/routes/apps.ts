import type { FastifyPluginAsync } from 'fastify';

export const supportedApps = [
  'Codex',
  'Gmail',
  'Gcal',
  'Slack',
  'Notion'
] as const;

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
