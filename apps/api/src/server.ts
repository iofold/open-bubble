import { buildApp } from './app.js';
import { loadRepoEnv } from './lib/env.js';

const defaultPort = 3000;
const defaultHost = '127.0.0.1';

const getPort = (): number => {
  const rawPort = process.env['PORT'];

  if (!rawPort) {
    return defaultPort;
  }

  const parsedPort = Number(rawPort);
  return Number.isInteger(parsedPort) && parsedPort > 0
    ? parsedPort
    : defaultPort;
};

const main = async (): Promise<void> => {
  loadRepoEnv();
  const app = await buildApp();

  await app.listen({
    host: process.env['HOST'] ?? defaultHost,
    port: getPort()
  });
};

await main();
