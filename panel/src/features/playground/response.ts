import { isRecord } from '../../utils/helpers';

export const readText = (body: unknown): string => {
  if (!isRecord(body)) return typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  if (Array.isArray(body.choices)) {
    const choice = body.choices.find(isRecord);
    if (choice && isRecord(choice.message) && typeof choice.message.content === 'string')
      return choice.message.content;
  }
  if (Array.isArray(body.output)) {
    return body.output
      .filter(isRecord)
      .filter((item) => Array.isArray(item.content))
      .map((item) => readText(item))
      .join('');
  }
  if (Array.isArray(body.content)) {
    return body.content
      .filter(isRecord)
      .map((block) => (typeof block.text === 'string' ? block.text : ''))
      .join('');
  }
  const error = isRecord(body.error) ? body.error.message : body.error;
  return typeof error === 'string' ? error : JSON.stringify(body, null, 2);
};

export const readTokens = (
  body: unknown,
  key: 'input_tokens' | 'output_tokens' | 'prompt_tokens' | 'completion_tokens'
) => {
  const usage = isRecord(body) && isRecord(body.usage) ? body.usage : null;
  return usage && typeof usage[key] === 'number' ? usage[key] : null;
};
