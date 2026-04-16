import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  readEnvVariable,
  selectPublicTunnelUrl,
  upsertEnvVariable
} from '../src/dev/ngrok-launcher.js';

void test('upsertEnvVariable appends a missing key without dropping existing entries', () => {
  const result = upsertEnvVariable(
    'EXISTING_VALUE=keep-me\nANOTHER_VALUE=still-here\n',
    'OPEN_BUBBLE_API_BASE_URL',
    'https://open-bubble.ngrok.app'
  );

  assert.equal(
    result,
    'EXISTING_VALUE=keep-me\nANOTHER_VALUE=still-here\nOPEN_BUBBLE_API_BASE_URL=https://open-bubble.ngrok.app\n'
  );
});

void test('upsertEnvVariable replaces an existing key in place', () => {
  const result = upsertEnvVariable(
    'OPEN_BUBBLE_API_BASE_URL=https://old-url.ngrok.app\nKEEP_ME=yes\n',
    'OPEN_BUBBLE_API_BASE_URL',
    'https://new-url.ngrok.app'
  );

  assert.equal(
    result,
    'OPEN_BUBBLE_API_BASE_URL=https://new-url.ngrok.app\nKEEP_ME=yes\n'
  );
});

void test('readEnvVariable ignores comments and returns the configured value', () => {
  const value = readEnvVariable(
    '# local config\nNGROK_AUTHTOKEN=secret-token\nOPEN_BUBBLE_API_BASE_URL=https://old-url.ngrok.app\n',
    'NGROK_AUTHTOKEN'
  );

  assert.equal(value, 'secret-token');
});

void test('selectPublicTunnelUrl prefers the named https tunnel', () => {
  const url = selectPublicTunnelUrl(
    {
      tunnels: [
        {
          name: 'temporary-other-tunnel',
          public_url: 'https://other.ngrok.app'
        },
        {
          name: 'open-bubble-api',
          public_url: 'http://open-bubble.ngrok-free.app'
        },
        {
          name: 'open-bubble-api',
          public_url: 'https://open-bubble.ngrok-free.app'
        }
      ]
    },
    'open-bubble-api'
  );

  assert.equal(url, 'https://open-bubble.ngrok-free.app');
});
