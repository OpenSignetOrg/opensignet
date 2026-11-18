'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { CodeCard } from '@/components/ui/code-card';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useManagementSession } from '@/components/agents/management-session';
import { formatDate, timeAgo } from '@/lib/utils';

interface ApiKeyRow {
  id: string;
  agentId: string | null;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface CreatedApiKey {
  id: string;
  agentId: string;
  name: string;
  prefix: string;
  fullKey: string;
  warning?: string;
}

interface ApiErrorBody {
  error?: string;
  code?: string;
  message?: string;
  details?: {
    feature?: string;
    current?: number;
    limit?: number;
    plan?: string;
    upgradeToLabel?: string | null;
  };
}

export function ApiKeyManagement({ agentId }: { agentId: string }) {
  const { signedIn, requireSignIn, sessionEnded } = useManagementSession();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState('Production key');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const activeKeys = useMemo(() => keys.filter((key) => !key.revokedAt), [keys]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setLimitMessage(null);
    try {
      const res = await fetch(`/api/v1/keys?agentId=${agentId}`, { credentials: 'include' });
      if (res.status === 401) {
        sessionEnded();
        return;
      }
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const data = (await res.json()) as { keys: ApiKeyRow[] };
      setKeys(data.keys);
    } catch {
      // Shown inside the panel, not as a toast: nobody asked for anything yet.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [agentId, sessionEnded]);

  useEffect(() => {
    if (!signedIn) return;
    void loadKeys();
  }, [loadKeys, signedIn]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireSignIn()) return;
    setCreating(true);
    setCreatedKey(null);
    setLimitMessage(null);
    let handledPlanLimit = false;
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, name: name.trim() || 'Agent key' }),
      });
      if (res.status === 401) {
        sessionEnded();
        return;
      }
      const data = (await res.json().catch(() => null)) as CreatedApiKey | ApiErrorBody | null;
      if (!res.ok) {
        const message =
          data && 'message' in data && data.message
            ? data.message
            : res.status === 404 || res.status >= 500
              ? 'The API key service is temporarily unavailable. Please try again in a moment.'
              : 'The API key could not be created. Please try again.';
        if (res.status === 402) {
          handledPlanLimit = true;
          setLimitMessage(message);
        }
        throw new Error(message);
      }
      const created = data as CreatedApiKey;
      setCreatedKey(created);
      setName('Production key');
      await loadKeys();
      toast.success('API key created');
    } catch {
      if (!handledPlanLimit) {
        toast.error('Couldn’t create the API key', {
          description: 'Nothing was created. Try again in a moment.',
        });
      }
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(key: ApiKeyRow) {
    if (!requireSignIn()) return;
    setRevokingId(key.id);
    try {
      const res = await fetch(`/api/v1/keys/${key.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.status === 401) {
        sessionEnded();
        return;
      }
      if (!res.ok) throw new Error(await readErrorMessage(res));
      setKeys((current) =>
        current.map((item) =>
          item.id === key.id ? { ...item, revokedAt: new Date().toISOString() } : item,
        ),
      );
      toast.success('API key revoked');
    } catch {
      toast.error('Couldn’t revoke the key', {
        description: 'The key still works. Try again in a moment.',
      });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card className="premium-surface mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <KeyRound className="h-5 w-5 text-primary" />
          API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loadFailed ? (
          <InlineNotice>
            We couldn’t load your API keys.{' '}
            <button
              type="button"
              onClick={() => void loadKeys()}
              className="font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </InlineNotice>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{activeKeys.length} active</Badge>
          <Badge variant="outline">Agent scoped</Badge>
        </div>

        <form onSubmit={createKey} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={1}
            maxLength={100}
            placeholder="Key name"
            disabled={creating}
          />
          <Button type="submit" disabled={creating} className="w-full sm:w-auto">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create key
          </Button>
        </form>

        {limitMessage && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {limitMessage}
          </div>
        )}

        {createdKey && (
          <CodeCard
            title={`New key: ${createdKey.name}`}
            code={createdKey.fullKey}
            copyLabel="API key"
            wrap
          />
        )}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Prefix</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2 pr-4">Last used</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : keys.length === 0 && !loadFailed ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No API keys yet. Create one to use the API.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <ApiKeyTableRow
                    key={key.id}
                    row={key}
                    onRevoke={revokeKey}
                    revokingId={revokingId}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {loading ? (
            <div className="rounded-lg border border-border/50 py-5 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            </div>
          ) : keys.length === 0 && !loadFailed ? (
            <div className="rounded-lg border border-border/50 py-5 text-center text-sm text-muted-foreground">
              No API keys yet. Create one to use the API.
            </div>
          ) : (
            keys.map((key) => (
              <div key={key.id} className="rounded-lg border border-border/60 bg-background/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="wrap-anywhere text-sm font-medium">{key.name}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      agk_{key.prefix}_...
                    </div>
                  </div>
                  <StatusBadge revokedAt={key.revokedAt} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(key.createdAt)}</span>
                  <span>{key.lastUsedAt ? timeAgo(key.lastUsedAt) : 'Never used'}</span>
                </div>
                {!key.revokedAt && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void revokeKey(key)}
                    disabled={revokingId === key.id}
                    className="mt-3 w-full"
                  >
                    {revokingId === key.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Revoke
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeyTableRow({
  row,
  onRevoke,
  revokingId,
}: {
  row: ApiKeyRow;
  onRevoke: (row: ApiKeyRow) => Promise<void>;
  revokingId: string | null;
}) {
  return (
    <tr className="border-t border-border/40 transition-colors hover:bg-primary/5">
      <td className="py-3 pr-4">
        <span className="wrap-anywhere font-medium">{row.name}</span>
      </td>
      <td className="py-3 pr-4 font-mono text-xs">agk_{row.prefix}_...</td>
      <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.createdAt)}</td>
      <td className="py-3 pr-4 text-xs text-muted-foreground">
        {row.lastUsedAt ? timeAgo(row.lastUsedAt) : 'Never used'}
      </td>
      <td className="py-3 pr-4">
        <StatusBadge revokedAt={row.revokedAt} />
      </td>
      <td className="py-3 text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onRevoke(row)}
          disabled={Boolean(row.revokedAt) || revokingId === row.id}
        >
          {revokingId === row.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Revoke
        </Button>
      </td>
    </tr>
  );
}

function StatusBadge({ revokedAt }: { revokedAt: string | null }) {
  return revokedAt ? (
    <Badge variant="secondary">Revoked</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  );
}

async function readErrorMessage(res: Response) {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.message ?? body?.error ?? `HTTP ${res.status}`;
}
