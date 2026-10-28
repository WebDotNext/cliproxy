/**
 * Builds copy-ready code for the selected model’s API through the proxy. React-free
 * so the escaping can be tested directly.
 */

export const SNIPPET_LANGUAGES = ['typescript', 'python', 'curl'] as const;
export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

export const ANTHROPIC_VERSION = '2023-06-01';
export const MAX_TOKENS = 1024;

export interface PlaygroundRequest {
  baseUrl: string;
  model: string;
  system: string;
  message: string;
}

/** The JSON body sent to `POST /v1/messages`. An empty system prompt is omitted. */
export const buildMessagesBody = ({ model, system, message }: PlaygroundRequest) => ({
  model,
  max_tokens: MAX_TOKENS,
  ...(system.trim() ? { system } : {}),
  messages: [{ role: 'user', content: message }],
});

// A JSON string literal is also a valid TypeScript and Python string literal.
const literal = (value: string) => JSON.stringify(value);

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const anthropicTypescript = (request: PlaygroundRequest) => {
  const system = request.system.trim() ? `\n  system: ${literal(request.system)},` : '';
  return `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: ${literal(request.baseUrl)},
  apiKey: process.env.CLIPROXY_KEY,
});

const msg = await client.messages.create({
  model: ${literal(request.model)},
  max_tokens: ${MAX_TOKENS},${system}
  messages: [{ role: 'user', content: ${literal(request.message)} }],
});

console.log(msg.content[0].type === 'text' ? msg.content[0].text : msg.content);`;
};

const anthropicPython = (request: PlaygroundRequest) => {
  const system = request.system.trim() ? `\n    system=${literal(request.system)},` : '';
  return `import os
from anthropic import Anthropic

client = Anthropic(
    base_url=${literal(request.baseUrl)},
    api_key=os.environ["CLIPROXY_KEY"],
)

msg = client.messages.create(
    model=${literal(request.model)},
    max_tokens=${MAX_TOKENS},${system}
    messages=[{"role": "user", "content": ${literal(request.message)}}],
)

print(msg.content[0].text)`;
};

export const requestProtocol = (model: string) =>
  /^(gpt-|o[134](?:-|$))/.test(model)
    ? 'responses'
    : model.startsWith('grok-')
      ? 'chat'
      : 'anthropic';

export const buildApiRequest = (request: PlaygroundRequest) => {
  const protocol = requestProtocol(request.model);
  const messages = [
    ...(request.system.trim() ? [{ role: 'system', content: request.system }] : []),
    { role: 'user', content: request.message },
  ];
  if (protocol === 'responses')
    return {
      path: '/v1/responses',
      body: {
        model: request.model,
        max_output_tokens: MAX_TOKENS,
        ...(request.system.trim() ? { instructions: request.system } : {}),
        input: request.message,
      },
    };
  if (protocol === 'chat')
    return {
      path: '/v1/chat/completions',
      body: { model: request.model, max_tokens: MAX_TOKENS, messages },
    };
  return { path: '/v1/messages', body: buildMessagesBody(request) };
};

export const buildSnippet = (language: SnippetLanguage, request: PlaygroundRequest) => {
  const protocol = requestProtocol(request.model);
  const { path, body } = buildApiRequest(request);
  if (language === 'curl') {
    const auth =
      protocol === 'anthropic'
        ? '-H "x-api-key: $CLIPROXY_KEY" -H "anthropic-version: ' + ANTHROPIC_VERSION + '"'
        : '-H "Authorization: Bearer $CLIPROXY_KEY"';
    return `curl ${shellQuote(request.baseUrl + path)} ${auth} -H "content-type: application/json" -d ${shellQuote(JSON.stringify(body))}`;
  }
  if (protocol === 'anthropic')
    return language === 'typescript' ? anthropicTypescript(request) : anthropicPython(request);
  const method = protocol === 'responses' ? 'responses.create' : 'chat.completions.create';
  const output = protocol === 'responses' ? 'output_text' : 'choices[0].message.content';
  if (language === 'typescript')
    return `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: ${literal(request.baseUrl + '/v1')},
  apiKey: process.env.CLIPROXY_KEY,
});

const response = await client.${method}(${JSON.stringify(body, null, 2)});
console.log(response.${output});`;
  return `import os
from openai import OpenAI

client = OpenAI(
    base_url=${literal(request.baseUrl + '/v1')},
    api_key=os.environ["CLIPROXY_KEY"],
)

response = client.${method}(**${JSON.stringify(body, null, 2)})
print(response.${output})`;
};
