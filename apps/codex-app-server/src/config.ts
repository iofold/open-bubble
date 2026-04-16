import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RepoMapping } from './infer.js';

interface RepoConfigFile {
  repos: RepoMapping[];
}

export const defaultRepoConfigPath = resolve(
  process.cwd(),
  'config',
  'repos.json'
);

export const loadRepoMappings = async (
  configPath: string = process.env['OPEN_BUBBLE_REPO_CONFIG'] ?? defaultRepoConfigPath
): Promise<RepoMapping[]> => {
  const raw = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as RepoConfigFile;

  if (!Array.isArray(parsed.repos) || parsed.repos.length === 0) {
    throw new Error(`Repo config "${configPath}" must contain at least one repo mapping.`);
  }

  return parsed.repos;
};
