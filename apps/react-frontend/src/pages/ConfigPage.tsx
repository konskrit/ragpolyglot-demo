import { useEffect, useState } from 'react';
import type { RuntimeConfig, RuntimeConfigUpdate } from '@ragpolyglot-shared';
import { ApiError, getJson, putJson } from '../api/client';
import { Button } from '../components/Button';
import { PageSpinner } from '../components/PageSpinner';
import { dirtyValues, groupByServices } from '../lib/runtime-config';

const fieldClass =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-gray-100 font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

export function ConfigPage() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RuntimeConfigUpdate | null>(null);
  const [copied, setCopied] = useState(false);

  const applyPayload = (payload: RuntimeConfig) => {
    setConfig(payload);
    setDraft(Object.fromEntries(payload.settings.map((s) => [s.key, s.value])));
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const payload = await getJson<RuntimeConfig>('/api/config');
        if (cancelled) return;
        applyPayload(payload);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Failed to load config');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const settings = config?.settings ?? [];
  const saved = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const dirty = dirtyValues(draft, saved);
  const dirtyCount = Object.keys(dirty).length;

  const setValue = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setResult(null);
    setCopied(false);
  };

  const discard = () => {
    setDraft(saved);
    setResult(null);
    setCopied(false);
    setError(null);
  };

  const save = async () => {
    if (dirtyCount === 0 || saving) return;
    setSaving(true);
    setError(null);
    setCopied(false);
    try {
      const payload = await putJson<RuntimeConfigUpdate>('/api/config', dirty);
      applyPayload(payload);
      setResult(payload);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const copyCommand = async () => {
    if (!result?.command) return;
    try {
      await navigator.clipboard.writeText(result.command);
      setCopied(true);
    } catch {
      setError('Could not copy command to clipboard');
    }
  };

  if (loading && !config) {
    return <PageSpinner />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Config</h1>
          <p className="text-gray-400">
            Allowlisted operator knobs. Writes to{' '}
            <code className="text-gray-300">.env</code>; recreate services to
            apply.
          </p>
          {config?.envFilePath ? (
            <p className="mt-2 text-xs text-gray-500 font-mono truncate">
              {config.envFilePath}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            disabled={dirtyCount === 0 || saving}
            onClick={discard}
          >
            Discard
          </Button>
          <Button
            disabled={dirtyCount === 0 || saving}
            onClick={() => void save()}
          >
            {saving
              ? 'Saving…'
              : dirtyCount === 0
                ? 'Save'
                : `Save ${dirtyCount}`}
          </Button>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      {result ? (
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
          {result.changedKeys.length === 0 ? (
            <p className="text-sm text-gray-400">No values changed on disk.</p>
          ) : (
            <>
              <p className="text-sm text-gray-300">
                Updated{' '}
                <span className="font-mono text-gray-100">
                  {result.changedKeys.join(', ')}
                </span>
                . Restart is not enough — recreate:
              </p>
              <div className="flex flex-wrap gap-2">
                {result.recreateServices.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-md border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-300 font-mono"
                  >
                    {svc}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 items-start">
                <pre className="flex-1 min-w-0 overflow-x-auto rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-indigo-200 font-mono whitespace-pre-wrap">
                  {result.command}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyCommand()}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="space-y-8">
        {groupByServices(settings).map((group) => (
          <section key={group.label}>
            <h2 className="text-sm font-medium text-gray-300 mb-3 tracking-wide">
              {group.label}
            </h2>
            <ul className="space-y-2">
              {group.settings.map((setting) => {
                const value = draft[setting.key] ?? '';
                const dirtyRow = saved[setting.key] !== value;
                return (
                  <li
                    key={setting.key}
                    className={`grid grid-cols-[minmax(0,1fr)_minmax(8rem,14rem)] gap-3 items-center rounded-lg border px-3 py-2 ${
                      dirtyRow
                        ? 'border-indigo-500/40 bg-indigo-950/20'
                        : 'border-gray-800 bg-gray-900/40'
                    }`}
                  >
                    <label
                      htmlFor={`cfg-${setting.key}`}
                      className="min-w-0 font-mono text-sm text-gray-200 truncate"
                      title={setting.key}
                    >
                      {setting.key}
                    </label>
                    {setting.kind === 'bool' ? (
                      <input
                        id={`cfg-${setting.key}`}
                        type="checkbox"
                        checked={value === 'true'}
                        onChange={(e) =>
                          setValue(
                            setting.key,
                            e.target.checked ? 'true' : 'false',
                          )
                        }
                        className="justify-self-end size-4 rounded border-gray-600 bg-gray-950 text-indigo-500 focus-visible:outline-indigo-500"
                      />
                    ) : (
                      <input
                        id={`cfg-${setting.key}`}
                        type={setting.kind === 'int' ? 'number' : 'text'}
                        step={setting.kind === 'int' ? 1 : undefined}
                        value={value}
                        onChange={(e) => setValue(setting.key, e.target.value)}
                        className={fieldClass}
                        spellCheck={false}
                        autoComplete="off"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
