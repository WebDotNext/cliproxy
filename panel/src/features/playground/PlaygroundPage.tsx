import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconCheck, IconCopy } from '@/components/ui/icons';
import { useApiKeysForModels } from '@/hooks/useApiKeysForModels';
import { apiKeyNameFingerprint, readApiKeyNames } from '@/features/config/apiKeyNames';
import { useAuthStore, useModelsStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { maskApiKey } from '@/utils/format';
import { isRecord } from '@/utils/helpers';
import {
  ANTHROPIC_VERSION,
  SNIPPET_LANGUAGES,
  buildMessagesBody,
  buildSnippet,
  type SnippetLanguage,
} from './snippets';
import { latestClaudeModels } from './latestModels';
import styles from './PlaygroundPage.module.scss';

const LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  curl: 'curl',
};

interface PlaygroundResult {
  status: number;
  ms: number;
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

const readText = (body: unknown): string => {
  if (!isRecord(body)) return typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  if (Array.isArray(body.content)) {
    return body.content
      .filter(isRecord)
      .map((block) => (typeof block.text === 'string' ? block.text : ''))
      .join('');
  }
  const error = isRecord(body.error) ? body.error.message : body.error;
  return typeof error === 'string' ? error : JSON.stringify(body, null, 2);
};

const readTokens = (body: unknown, key: 'input_tokens' | 'output_tokens') => {
  const usage = isRecord(body) && isRecord(body.usage) ? body.usage : null;
  return usage && typeof usage[key] === 'number' ? usage[key] : null;
};

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={styles.copy}
      onClick={async () => setCopied(await copyToClipboard(text))}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      {t(copied ? 'playground.copied' : 'playground.copy')}
    </button>
  );
}

export function PlaygroundPage() {
  const { t } = useTranslation();
  const apiBase = useAuthStore((state) => state.apiBase);
  const connected = useAuthStore((state) => state.connectionStatus) === 'connected';
  const models = useModelsStore((state) => state.models);
  const fetchModels = useModelsStore((state) => state.fetchModels);
  const resolveApiKeys = useApiKeysForModels();

  const [keys, setKeys] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showOlderModels, setShowOlderModels] = useState(false);
  const [system, setSystem] = useState(() => t('playground.example_system'));
  const [message, setMessage] = useState(() => t('playground.example_message'));
  const [language, setLanguage] = useState<SnippetLanguage>('typescript');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void resolveApiKeys().then((list) => {
      if (cancelled) return;
      setKeys(list);
      setApiKey((current) => (list.includes(current) ? current : (list[0] ?? '')));
    });
    return () => {
      cancelled = true;
    };
  }, [connected, resolveApiKeys]);

  useEffect(() => {
    if (connected && apiKey) void fetchModels(apiBase, apiKey).catch(() => undefined);
  }, [apiBase, apiKey, connected, fetchModels]);

  const modelOptions = useMemo(() => {
    const names = models.map(({ name }) => name);
    const visible = showOlderModels
      ? [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : latestClaudeModels(names);
    return visible.map((name) => ({ value: name, label: name }));
  }, [models, showOlderModels]);

  // Haiku is the cheapest fit for short jobs like categorizing, so prefer it.
  useEffect(() => {
    if (modelOptions.some((option) => option.value === model)) return;
    const haiku = modelOptions.find((option) => option.value.includes('haiku'));
    setModel((haiku ?? modelOptions[0])?.value ?? '');
  }, [model, modelOptions]);

  const keyOptions = useMemo(() => {
    const names = readApiKeyNames(apiBase);
    return keys.map((key) => {
      const name = names[apiKeyNameFingerprint(apiBase, key)];
      return { value: key, label: name ? `${name} · ${maskApiKey(key)}` : maskApiKey(key) };
    });
  }, [apiBase, keys]);

  const request = { baseUrl: apiBase, model, system, message };
  const snippet = buildSnippet(language, request);
  const canSend = connected && Boolean(apiKey && model && message.trim()) && !sending;

  const send = async () => {
    setSending(true);
    const started = performance.now();
    try {
      const response = await axios.post(`${apiBase}/v1/messages`, buildMessagesBody(request), {
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        validateStatus: () => true,
      });
      setResult({
        status: response.status,
        ms: Math.round(performance.now() - started),
        text: readText(response.data),
        inputTokens: readTokens(response.data, 'input_tokens'),
        outputTokens: readTokens(response.data, 'output_tokens'),
      });
    } catch (error) {
      setResult({
        status: 0,
        ms: Math.round(performance.now() - started),
        text: error instanceof Error ? error.message : String(error),
        inputTokens: null,
        outputTokens: null,
      });
    } finally {
      setSending(false);
    }
  };

  const ok = result !== null && result.status >= 200 && result.status < 300;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('playground.title')}</h1>

      <dl className={styles.connection}>
        <dt>{t('playground.base_url')}</dt>
        <dd>
          <code>{apiBase}</code>
          <CopyButton text={apiBase} />
        </dd>
        <dt>{t('playground.api_key')}</dt>
        <dd>
          {keys.length > 1 ? (
            <Select
              value={apiKey}
              options={keyOptions}
              onChange={setApiKey}
              size="sm"
              ariaLabel={t('playground.api_key')}
            />
          ) : (
            <code>{apiKey ? maskApiKey(apiKey) : t('playground.no_key')}</code>
          )}
          {apiKey && <CopyButton text={apiKey} />}
        </dd>
      </dl>

      <div className={styles.columns}>
        <section className={styles.column}>
          <div className={styles.field}>
            <span>{t('playground.model')}</span>
            <div className={styles.modelRow}>
              <Select
                value={model}
                options={modelOptions}
                onChange={setModel}
                size="sm"
                ariaLabel={t('playground.model')}
              />
              <ToggleSwitch
                checked={showOlderModels}
                onChange={setShowOlderModels}
                label={t('playground.older_models')}
              />
            </div>
          </div>
          <label className={styles.field}>
            <span>{t('playground.system')}</span>
            <textarea rows={3} value={system} onChange={(event) => setSystem(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>{t('playground.message')}</span>
            <textarea
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
                  void send();
                }
              }}
            />
          </label>
          <div>
            <Button size="sm" onClick={send} disabled={!canSend} loading={sending}>
              {t('playground.send')}
            </Button>
          </div>

          {result && (
            <div className={styles.result}>
              <div className={styles.resultMeta}>
                <span className={ok ? styles.ok : styles.error}>{result.status || 'ERR'}</span>
                <span>{t('playground.ms', { ms: result.ms })}</span>
                {result.inputTokens !== null && result.outputTokens !== null && (
                  <span>
                    {t('playground.tokens', {
                      input: result.inputTokens,
                      output: result.outputTokens,
                    })}
                  </span>
                )}
              </div>
              <pre className={styles.code}>{result.text}</pre>
            </div>
          )}
        </section>

        <section className={styles.column}>
          <div className={styles.codeHead}>
            <div className={styles.tabs} role="tablist">
              {SNIPPET_LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={option === language}
                  className={option === language ? styles.tabActive : styles.tab}
                  onClick={() => setLanguage(option)}
                >
                  {LANGUAGE_LABELS[option]}
                </button>
              ))}
            </div>
            <CopyButton text={snippet} />
          </div>
          <pre className={styles.code}>{snippet}</pre>
          <p className={styles.hint}>{t('playground.env_hint')}</p>
        </section>
      </div>
    </div>
  );
}
