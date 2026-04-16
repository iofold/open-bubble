import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RepoMapping } from './infer.js';

interface RepoConfigFile {
  repos: RepoMapping[];
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

const defaultRepoConfigCandidates = [
  resolve(moduleDirectory, '..', 'config', 'repos.json'),
  resolve(moduleDirectory, '..', '..', 'config', 'repos.json')
];

export const defaultRepoConfigPath =
  defaultRepoConfigCandidates.find((candidate) => existsSync(candidate)) ??
  resolve(moduleDirectory, '..', 'config', 'repos.json');

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
