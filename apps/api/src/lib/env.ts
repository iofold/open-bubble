import { existsSync, readFileSync } from 'node:fs';
import { resolveFromRepoRoot } from './openapi.js';

const envLinePattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

const stripWrappingQuotes = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const parseEnvFile = (filePath: string): Record<string, string> => {
  const content = readFileSync(filePath, 'utf8');
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const trimmedLine = rawLine.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue;
    }

    const match = rawLine.match(envLinePattern);

    if (!match) {
      continue;
    }

    const key = match[1];
    const value = stripWrappingQuotes(match[2] ?? '');

    if (key) {
      parsed[key] = value;
    }
  }

  return parsed;
};

export const loadRepoEnv = (): void => {
  const envPath = resolveFromRepoRoot('.env');

  if (!existsSync(envPath)) {
    return;
  }

  const parsed = parseEnvFile(envPath);

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};
