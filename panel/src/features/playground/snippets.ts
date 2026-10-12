/**
 * Builds copy-ready code for a Messages API call through the proxy. React-free
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

const typescript = (request: PlaygroundRequest) => {
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

const python = (request: PlaygroundRequest) => {
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

const curl = (request: PlaygroundRequest) =>
  `curl ${request.baseUrl}/v1/messages \\
  -H "x-api-key: $CLIPROXY_KEY" \\
  -H "anthropic-version: ${ANTHROPIC_VERSION}" \\
  -H "content-type: application/json" \\
  -d ${shellQuote(JSON.stringify(buildMessagesBody(request)))}`;

const BUILDERS: Record<SnippetLanguage, (request: PlaygroundRequest) => string> = {
  typescript,
  python,
  curl,
};

export const buildSnippet = (language: SnippetLanguage, request: PlaygroundRequest) =>
  BUILDERS[language](request);
