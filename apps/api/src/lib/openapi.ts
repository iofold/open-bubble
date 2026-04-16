import { existsSync } from 'node:fs';
import * as path from 'node:path';

const candidateRepoRoots = (): string[] => [
  path.resolve(import.meta.dirname, '..', '..', '..', '..'),
  path.resolve(import.meta.dirname, '..', '..', '..', '..', '..')
];

export const resolveFromRepoRoot = (...segments: string[]): string => {
  const roots = candidateRepoRoots();

  for (const root of roots) {
    const candidate = path.resolve(root, ...segments);

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const fallbackRoot = roots[0] ?? process.cwd();
  return path.resolve(fallbackRoot, ...segments);
};

export const resolveOpenApiPath = (): string =>
  resolveFromRepoRoot('docs', 'api', 'openapi.yaml');

export const openApiExists = (): boolean => existsSync(resolveOpenApiPath());
