import { mkdtemp, readFile, rm, writeFile, chmod, mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import {
  createSpawnEnvironment,
  readPinnedPnpmVersion
} from '../src/gateway.js';

void test('readPinnedPnpmVersion reads the pinned pnpm version from package.json', async () => {
  const repoDir = await mkdtemp(join(tmpdir(), 'codex-app-server-gateway-'));

  try {
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify({
        name: 'demo-repo',
        packageManager: 'pnpm@10.27.0'
      }),
      'utf8'
    );

    const version = await readPinnedPnpmVersion(repoDir);
    assert.equal(version, '10.27.0');
  } finally {
    await rm(repoDir, { force: true, recursive: true });
  }
});

void test('createSpawnEnvironment prepends repo bins and installs a pnpm shim when pnpm is missing', async () => {
  const repoDir = await mkdtemp(join(tmpdir(), 'codex-app-server-gateway-'));
  const toolDir = await mkdtemp(join(tmpdir(), 'codex-app-server-tools-'));
  const originalPath = process.env.PATH;
  const fakeNpxPath = join(toolDir, 'npx');

  try {
    await mkdir(join(repoDir, 'node_modules', '.bin'), { recursive: true });
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify({
        name: 'demo-repo',
        packageManager: 'pnpm@10.27.0'
      }),
      'utf8'
    );
    await writeFile(fakeNpxPath, '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(fakeNpxPath, 0o755);

    process.env.PATH = toolDir;

    const environment = await createSpawnEnvironment(repoDir);

    try {
      const [shimDir, repoNodeModulesBin] = environment.env.PATH?.split(delimiter) ?? [];

      assert.equal(environment.env.HUSKY, '0');
      assert.ok(shimDir);
      assert.equal(repoNodeModulesBin, join(repoDir, 'node_modules', '.bin'));

      const shimContents = await readFile(join(shimDir, 'pnpm'), 'utf8');
      assert.match(shimContents, /pnpm@10\.27\.0/);
      assert.match(shimContents, new RegExp(fakeNpxPath.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    } finally {
      await environment.cleanup();
    }
  } finally {
    process.env.PATH = originalPath;
    await rm(repoDir, { force: true, recursive: true });
    await rm(toolDir, { force: true, recursive: true });
  }
});
