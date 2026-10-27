import { expect, test } from 'bun:test';
import { buildMessagesBody, buildSnippet } from '../src/features/playground/snippets';
import { latestModels } from '../src/features/playground/latestModels';

const request = {
  baseUrl: 'http://127.0.0.1:8317',
  model: 'claude-haiku-4-5',
  system: '',
  message: `PICK N PAY "DEPOT" O'NEILL\nR120`,
};

test('snippets carry the exact request, quotes and newlines included', () => {
  expect(buildMessagesBody(request)).not.toHaveProperty('system');

  const curl = buildSnippet('curl', request);
  const quoted = curl.slice(curl.indexOf("-d '") + 4, -1).replace(/'\\''/g, "'");
  expect(JSON.parse(quoted)).toEqual(buildMessagesBody(request));

  const typescript = buildSnippet('typescript', { ...request, system: 'Reply with one word.' });
  expect(typescript).toContain(`content: ${JSON.stringify(request.message)}`);
  expect(typescript).toContain('system: "Reply with one word."');
});

test('model picker keeps the newest Claude per family and every other provider', () => {
  expect(
    latestModels([
      'gpt-6.1-sol',
      'gemini-3.8-flash',
      'claude-opus-4-5-20251101',
      'claude-opus-5',
      'claude-opus-5-5',
      'claude-haiku-4-5',
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-sonnet-4-6',
      'claude-fable-5',
      'claude-fable-5-1',
      'claude-3-7-sonnet-20250219',
    ])
  ).toEqual([
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
    'claude-fable-5-1',
    'gemini-3.8-flash',
    'gpt-6.1-sol',
  ]);
});
