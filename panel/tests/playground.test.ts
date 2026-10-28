import { expect, test } from 'bun:test';
import {
  buildApiRequest,
  buildMessagesBody,
  buildSnippet,
} from '../src/features/playground/snippets';
import { readText, readTokens } from '../src/features/playground/response';
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

test('model picker keeps the newest Claude per family and unrelated providers', () => {
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

test('OpenAI and Grok use matching endpoints and SDK snippets', () => {
  for (const [model, path, method] of [
    ['gpt-6.1-sol', '/v1/responses', 'responses.create'],
    ['grok-4.7', '/v1/chat/completions', 'chat.completions.create'],
  ]) {
    const input = { ...request, model, system: 'Be brief.' };
    expect(buildApiRequest(input).path).toBe(path);
    for (const language of ['typescript', 'python'] as const)
      expect(buildSnippet(language, input)).toContain(method);
    const curl = buildSnippet('curl', input);
    expect(curl).toContain('Authorization: Bearer');
    const quoted = curl.slice(curl.indexOf("-d '") + 4, -1).replace(/'\\''/g, "'");
    expect(JSON.parse(quoted)).toEqual(buildApiRequest(input).body);
    const body = buildApiRequest(input).body;
    if ('input' in body) {
      expect(body.input).toBe(request.message);
      expect(body.instructions).toBe('Be brief.');
    } else {
      expect(body.messages).toEqual([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: request.message },
      ]);
    }
  }
});

test('latest GPT and Grok releases preserve each variant', () => {
  const ids = [
    'gpt-5.6-sol',
    'gpt-6-sol',
    'gpt-6.1-sol',
    'gpt-5.6-terra',
    'grok-4.6',
    'grok-4.7',
    'grok-3-mini',
    'grok-4.7-build-fast',
  ];
  expect(latestModels(ids)).toEqual([
    'gpt-5.6-terra',
    'gpt-6.1-sol',
    'grok-3-mini',
    'grok-4.7',
    'grok-4.7-build-fast',
  ]);
});

test('reads text and token usage from all three response formats', () => {
  const anthropic = {
    content: [{ type: 'text', text: 'Groceries' }],
    usage: { input_tokens: 12, output_tokens: 2 },
  };
  const responses = {
    output: [
      { type: 'reasoning' },
      { type: 'message', content: [{ type: 'output_text', text: 'Groceries' }] },
    ],
    usage: { input_tokens: 13, output_tokens: 3 },
  };
  const chat = {
    choices: [{ message: { content: 'Groceries' } }],
    usage: { prompt_tokens: 14, completion_tokens: 4 },
  };
  expect(readText(anthropic)).toBe('Groceries');
  expect(readText(responses)).toBe('Groceries');
  expect(readText(chat)).toBe('Groceries');
  expect(readTokens(responses, 'input_tokens')).toBe(13);
  expect(readTokens(chat, 'prompt_tokens')).toBe(14);
});
