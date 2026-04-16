import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { inferRepoFromPrompt, type RepoMapping } from '../src/infer.js';

const mappings: RepoMapping[] = [
  {
    id: 'supercom-backend',
    cwd: '/Users/demo/code/supercom/backend',
    aliases: ['supercom', 'dispatch', 'ops']
  },
  {
    id: 'bubble-marketing',
    cwd: '/Users/demo/code/open-bubble/site',
    aliases: ['landing', 'marketing', 'homepage'],
    isDefault: true
  }
];

void test('inferRepoFromPrompt picks the repo with the strongest alias match', () => {
  const result = inferRepoFromPrompt(
    'Please fix the dispatch queue badge in supercom ops.',
    mappings
  );

  assert.deepEqual(result, {
    id: 'supercom-backend',
    cwd: '/Users/demo/code/supercom/backend',
    reason: 'alias_match'
  });
});

void test('inferRepoFromPrompt falls back to the default repo when no alias matches', () => {
  const result = inferRepoFromPrompt(
    'Please polish this screen and open a PR.',
    mappings
  );

  assert.deepEqual(result, {
    id: 'bubble-marketing',
    cwd: '/Users/demo/code/open-bubble/site',
    reason: 'default_repo'
  });
});

void test('inferRepoFromPrompt falls back to a single configured repo for the demo path', () => {
  const result = inferRepoFromPrompt('Please polish this screen.', [
    {
      id: 'supercom-backend',
      cwd: '/Users/demo/code/supercom/backend',
      aliases: ['supercom']
    }
  ]);

  assert.deepEqual(result, {
    id: 'supercom-backend',
    cwd: '/Users/demo/code/supercom/backend',
    reason: 'single_repo'
  });
});
