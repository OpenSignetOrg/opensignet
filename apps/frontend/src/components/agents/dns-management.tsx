'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  DNS_RECORD_TYPES,
  type DnsRecordData,
  type DnsRecordType,
  type DnsServiceParam,
} from '@opensignet/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectMenu } from '@/components/ui/select-menu';
import {
  AlertTriangle,
  Braces,
  Check,
  Copy,
  Lock,
  Search,
  Download,
  Edit2,
  FileCode2,
  FileUp,
  GitMerge,
  Layers3,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useManagementSession } from '@/components/agents/management-session';

interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  value: string;
  data?: DnsRecordData | null;
  ttl: number;
  priority?: number | null;
  systemManaged?: boolean;
  purpose?: string | null;
}

interface DnsFormState {
  id?: string;
  type: DnsRecordType;
  name: string;
  ttl: number;
  address: string;
  target: string;
  flag: 0 | 128;
  tag: 'issue' | 'issuewild' | 'iodef';
  caaValue: string;
  priority: number;
  exchange: string;
  nameserver: string;
  pointer: string;
  weight: number;
  port: number;
  usage: number;
  selector: number;
  matchingType: number;
  associationData: string;
  text: string;
  params: DnsServiceParam[];
}

interface BulkPreview {
  baseRevision: string;
  summary: {
    add: number;
    update: number;
    delete: number;
    unchanged: number;
    finalUserRecords: number;
  };
  warnings: string[];
}

interface HostingTransition {
  mode: 'managed' | 'external';
  status: 'ready' | 'pending';
  warning?: string;
}

export function DnsManagement({
  agentId,
  initialDns,
}: {
  agentId: string;
  initialDns: DnsRecord[];
}) {
  const { requireSignIn, sessionEnded } = useManagementSession();
  const unauthorized = (res: Response) => {
    if (res.status !== 401) return false;
    sessionEnded();
    return true;
  };
  const [records, setRecords] = useState<DnsRecord[]>(initialDns);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [recordLimit, setRecordLimit] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/plan`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((plan: { entitlement?: { limits?: { dnsRecords?: number } } } | null) => {
        const limit = plan?.entitlement?.limits?.dnsRecords;
        if (typeof limit === 'number') setRecordLimit(limit);
      })
      // The count still shows without the limit; nothing to tell the person.
      .catch(() => undefined);
    return () => controller.abort();
  }, [agentId]);
  const userRecords = useMemo(() => records.filter((r) => !r.systemManaged), [records]);
  const systemRecords = useMemo(() => records.filter((r) => r.systemManaged), [records]);
  const typeOptions = useMemo(
    () => [
      { value: 'all', label: 'All types' },
      ...DNS_RECORD_TYPES.filter((type) => records.some((r) => r.type === type)).map((type) => ({
        value: type as string,
        label: type as string,
      })),
    ],
    [records],
  );
  const matches = (record: DnsRecord) => {
    const text = query.trim().toLowerCase();
    return (
      (typeFilter === 'all' || record.type === typeFilter) &&
      (!text ||
        record.name.toLowerCase().includes(text) ||
        record.value.toLowerCase().includes(text) ||
        record.type.toLowerCase().includes(text))
    );
  };
  const filteredUser = sortRecords(userRecords.filter(matches));
  const filteredSystem = sortRecords(systemRecords.filter(matches));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DnsRecord | null>(null);

  const [form, setForm] = useState<DnsFormState>(emptyDnsForm());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEditor, setBulkEditor] = useState<'zone' | 'json'>('zone');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState<'merge' | 'replace'>('merge');
  const [zoneFile, setZoneFile] = useState('');
  const [jsonRecords, setJsonRecords] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  const openAdd = () => {
    setForm(emptyDnsForm());
    setIsEditing(false);
    setError(null);
    setIsModalOpen(true);
  };

  const openEdit = (record: DnsRecord) => {
    if (record.systemManaged) {
      toast.info('System-managed record', {
        description:
          'OpenSignet manages this record for email, verification or routing, so it is read-only here.',
      });
      return;
    }
    setForm(formFromRecord(record));
    setIsEditing(true);
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmit = async (e?: React.FormEvent, addAnother = false) => {
    e?.preventDefault();
    if (!requireSignIn()) return;
    setLoading(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/v1/agents/${agentId}/dns/${form.id}`
        : `/api/v1/agents/${agentId}/dns`;

      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          data: dataFromForm(form),
          ttl: Number(form.ttl),
        }),
      });
      if (unauthorized(res)) return;

      if (!res.ok) {
        const data = await res.json();
        const detail =
          typeof data?.details === 'string'
            ? data.details
            : data?.details && typeof data.details === 'object' && 'message' in data.details
              ? String((data.details as { message?: unknown }).message ?? '')
              : '';
        throw new Error(`${data.message || 'Failed to save record'}${detail ? `: ${detail}` : ''}`);
      }

      const savedRecord = await res.json();

      if (isEditing) {
        setRecords(records.map((r) => (r.id === savedRecord.id ? savedRecord : r)));
      } else {
        setRecords([...records, savedRecord]);
      }

      const isApexRoutingChange =
        ['A', 'AAAA', 'ALIAS', 'CNAME'].includes(savedRecord.type) && savedRecord.name === '@';
      showHostingTransitionToast(savedRecord.hosting, {
        title: isApexRoutingChange ? 'Apex routing updated' : 'DNS record saved',
        description: isApexRoutingChange
          ? `OpenSignet routing has been detached. Existing DNS/browser caches may show the previous site for up to ${formatTtl(savedRecord.ttl)}.`
          : undefined,
      });

      if (addAnother) {
        setForm({ ...emptyDnsForm(), type: form.type, ttl: form.ttl });
        setIsEditing(false);
        toast.success('DNS record saved', { description: 'The form is ready for another record.' });
      } else {
        closeModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    if (!requireSignIn()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/agents/${agentId}/dns/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (unauthorized(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail =
          typeof data?.details === 'string'
            ? data.details
            : data?.details && typeof data.details === 'object' && 'message' in data.details
              ? String((data.details as { message?: unknown }).message ?? '')
              : '';
        throw new Error(
          `${data?.message || 'The record wasn’t deleted. Try again in a moment.'}${detail ? `: ${detail}` : ''}`,
        );
      }
      setRecords(records.filter((r) => r.id !== deleteTarget.id));
      showHostingTransitionToast(data?.hosting, { title: 'DNS record deleted' });
      setDeleteTarget(null);
    } catch (err) {
      toast.error('Delete failed', {
        description: (err instanceof Error && err.message) || 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const requestDelete = (record: DnsRecord) => {
    if (record.systemManaged) {
      toast.error('System-managed record', {
        description:
          'This record keeps email, verification or routing working and cannot be deleted here.',
      });
      return;
    }
    setDeleteTarget(record);
  };

  const openBulk = (editor: 'zone' | 'json') => {
    setBulkEditor(editor);
    setZoneFile('');
    setJsonRecords('');
    setBulkMode('merge');
    setBulkPreview(null);
    setReplaceConfirmed(false);
    setError(null);
    setBulkOpen(true);
  };

  const bulkRequest = () => {
    if (bulkEditor === 'zone') return { zoneFile, mode: bulkMode };
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonRecords) as unknown;
    } catch {
      throw new Error('JSON syntax is invalid. Check the record structure and try again.');
    }
    const records = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && 'records' in parsed
        ? (parsed as { records: unknown }).records
        : null;
    if (!Array.isArray(records)) {
      throw new Error(
        'JSON batch must be an array of DNS records or an object with a records array.',
      );
    }
    return { records, mode: bulkMode };
  };

  const previewBulk = async () => {
    if (!requireSignIn()) return;
    setBulkLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/agents/${agentId}/dns/${bulkEditor === 'zone' ? 'import' : 'batch'}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bulkRequest(), dryRun: true }),
        },
      );
      if (unauthorized(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Could not preview these DNS changes'));
      setBulkPreview(data as BulkPreview);
      setReplaceConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview these DNS changes');
    } finally {
      setBulkLoading(false);
    }
  };

  const applyBulk = async () => {
    if (
      !bulkPreview ||
      (bulkMode === 'replace' && bulkPreview.summary.delete > 0 && !replaceConfirmed)
    ) {
      return;
    }
    if (!requireSignIn()) return;
    setBulkLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/agents/${agentId}/dns/${bulkEditor === 'zone' ? 'import' : 'batch'}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...bulkRequest(),
            dryRun: false,
            baseRevision: bulkPreview.baseRevision,
          }),
        },
      );
      if (unauthorized(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Could not apply DNS changes'));
      if (Array.isArray(data?.records)) setRecords(data.records as DnsRecord[]);
      setBulkOpen(false);
      showHostingTransitionToast(data?.hosting, {
        title: 'DNS changes applied',
        description: `${bulkPreview.summary.add} added, ${bulkPreview.summary.update} updated, ${bulkPreview.summary.delete} removed.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply DNS changes');
    } finally {
      setBulkLoading(false);
    }
  };

  const exportZone = async () => {
    if (!requireSignIn()) return;
    try {
      const res = await fetch(`/api/v1/agents/${agentId}/dns/export?scope=user`, {
        credentials: 'include',
      });
      if (unauthorized(res)) return;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(apiErrorMessage(data, 'Could not export DNS records'));
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'dns-zone.txt';
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  return (
    <Card className="premium-surface mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">DNS records</h2>
            <p className="mt-1 max-w-md text-[13.5px] leading-5 text-muted-foreground">
              Served by OpenSignet nameservers. Saved changes go live within seconds.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:flex-nowrap lg:justify-end">
            <Button
              size="sm"
              onClick={openAdd}
              className="col-span-2 h-9 gap-1.5 rounded-lg sm:col-span-1"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add record
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBulk('zone')}
              className="h-9 gap-1.5 rounded-lg"
            >
              <FileUp className="h-4 w-4" aria-hidden /> Import zone
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBulk('json')}
              className="h-9 gap-1.5 rounded-lg"
            >
              <Layers3 className="h-4 w-4" aria-hidden /> Add multiple
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportZone}
              className="col-span-2 h-9 gap-1.5 rounded-lg sm:col-span-1"
            >
              <Download className="h-4 w-4" aria-hidden /> Export
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search records</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or value"
              className="h-9 rounded-lg pl-9"
            />
          </label>
          <SelectMenu
            value={typeFilter}
            options={typeOptions}
            onChange={setTypeFilter}
            ariaLabel="Filter by record type"
            className="sm:w-44"
          />
        </div>

        <RecordSection
          title="Your records"
          meta={
            recordLimit === null
              ? `${userRecords.length}`
              : `${userRecords.length} of ${recordLimit}`
          }
          records={filteredUser}
          emptyText={
            userRecords.length === 0
              ? 'No records yet. Add one, or import a zone file from your old DNS host.'
              : 'No records match this search.'
          }
          onEdit={openEdit}
          onDelete={requestDelete}
        />
        {systemRecords.length > 0 ? (
          <RecordSection
            title="Managed by OpenSignet"
            meta="Read-only"
            records={filteredSystem}
            emptyText="No managed records match this search."
            readOnly
          />
        ) : null}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 sm:backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dns-record-dialog-title"
              className="safe-bottom premium-surface max-h-[94svh] w-full overflow-hidden rounded-t-lg border shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:max-w-2xl sm:rounded-lg sm:zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 p-4">
                <h3 id="dns-record-dialog-title" className="font-semibold text-lg">
                  {isEditing ? 'Edit Record' : 'Add Record'}
                </h3>
                <button
                  onClick={closeModal}
                  className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close DNS record editor"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                className="max-h-[calc(94svh-4rem)] space-y-5 overflow-y-auto p-4 sm:p-6"
              >
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({
                          ...emptyDnsForm(),
                          id: form.id,
                          type: e.target.value as DnsRecordType,
                          name: form.name,
                          ttl: form.ttl,
                        })
                      }
                      disabled={isEditing && records.find((r) => r.id === form.id)?.systemManaged}
                      className="w-full h-10 rounded-md border border-input bg-background/70 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {DNS_RECORD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <label className="text-xs font-medium text-muted-foreground">Name / host</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={isEditing && records.find((r) => r.id === form.id)?.systemManaged}
                      placeholder={
                        form.type === 'SRV'
                          ? '_service._tcp'
                          : form.type === 'TLSA'
                            ? '_443._tcp'
                            : '@ or subdomain'
                      }
                      className="w-full h-10 rounded-md border border-input bg-background/70 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                <DynamicRecordFields form={form} setForm={setForm} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      TTL (seconds)
                    </label>
                    <input
                      type="number"
                      value={form.ttl}
                      onChange={(e) => setForm({ ...form, ttl: parseInt(e.target.value) || 3600 })}
                      disabled={isEditing && records.find((r) => r.id === form.id)?.systemManaged}
                      className="w-full h-10 rounded-md border border-input bg-background/70 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      min={60}
                      required
                    />
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    Supported TTL values range from 60 to 3,600 seconds. OpenSignet validates and
                    canonicalizes this record before applying it.
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeModal}
                    disabled={loading}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  {!isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSubmit(undefined, true)}
                      disabled={loading}
                      className="w-full sm:w-auto"
                    >
                      Save and add another
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={
                      loading || (isEditing && records.find((r) => r.id === form.id)?.systemManaged)
                    }
                    className="w-full min-w-[100px] sm:w-auto"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {bulkOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 sm:backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dns-bulk-dialog-title"
              className="safe-bottom premium-surface max-h-[94svh] w-full overflow-hidden rounded-t-lg border shadow-2xl sm:max-w-3xl sm:rounded-lg"
            >
              <div className="flex items-start justify-between border-b border-border/50 bg-muted/20 p-4 sm:p-5">
                <div>
                  <h3 id="dns-bulk-dialog-title" className="font-semibold text-lg">
                    Import or add multiple records
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Preview the exact change set before any provider write.
                  </p>
                </div>
                <button
                  onClick={() => setBulkOpen(false)}
                  className="touch-target inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Close"
                  aria-label="Close bulk DNS editor"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[calc(94svh-4.5rem)] space-y-5 overflow-y-auto p-4 sm:p-6">
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                    <div>
                      <p className="font-semibold">DNS changes could not be prepared</p>
                      <p className="mt-0.5 leading-relaxed text-red-900">{error}</p>
                    </div>
                  </div>
                )}

                <div
                  className="grid grid-cols-2 gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100/80 p-1.5"
                  aria-label="DNS input format"
                >
                  <button
                    type="button"
                    aria-pressed={bulkEditor === 'zone'}
                    onClick={() => {
                      setBulkEditor('zone');
                      setBulkPreview(null);
                      setReplaceConfirmed(false);
                      setError(null);
                    }}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors ${bulkEditor === 'zone' ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm' : 'border-transparent text-neutral-600 hover:border-neutral-300 hover:bg-white/80 hover:text-neutral-950'}`}
                  >
                    <FileCode2 className="h-4 w-4" />
                    BIND zone
                  </button>
                  <button
                    type="button"
                    aria-pressed={bulkEditor === 'json'}
                    onClick={() => {
                      setBulkEditor('json');
                      setBulkPreview(null);
                      setReplaceConfirmed(false);
                      setError(null);
                    }}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors ${bulkEditor === 'json' ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm' : 'border-transparent text-neutral-600 hover:border-neutral-300 hover:bg-white/80 hover:text-neutral-950'}`}
                  >
                    <Braces className="h-4 w-4" />
                    JSON records
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">Apply mode</span>
                    <div
                      className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-300 bg-white/50 p-1"
                      aria-label="DNS apply mode"
                    >
                      <button
                        type="button"
                        aria-pressed={bulkMode === 'merge'}
                        onClick={() => {
                          setBulkMode('merge');
                          setBulkPreview(null);
                          setReplaceConfirmed(false);
                          setError(null);
                        }}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${bulkMode === 'merge' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
                      >
                        <GitMerge className="h-4 w-4" />
                        Merge
                      </button>
                      <button
                        type="button"
                        aria-pressed={bulkMode === 'replace'}
                        onClick={() => {
                          setBulkMode('replace');
                          setBulkPreview(null);
                          setReplaceConfirmed(false);
                          setError(null);
                        }}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${bulkMode === 'replace' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Replace
                      </button>
                    </div>
                  </div>
                  <div
                    className={`flex min-h-[4.25rem] items-start gap-3 rounded-lg border p-3 ${bulkMode === 'merge' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}
                  >
                    <div
                      className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${bulkMode === 'merge' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                    >
                      {bulkMode === 'merge' ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </div>
                    <div className="text-xs leading-relaxed">
                      <p className="font-semibold">
                        {bulkMode === 'merge'
                          ? 'Preserve the current zone'
                          : 'Replace user-managed records'}
                      </p>
                      <p className="mt-0.5">
                        {bulkMode === 'merge'
                          ? 'Adds and updates the records below without removing existing records.'
                          : 'Removes missing user records only. Email, verification, and routing records stay protected.'}
                      </p>
                    </div>
                  </div>
                </div>

                {bulkEditor === 'zone' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      BIND zone records
                    </label>
                    <textarea
                      value={zoneFile}
                      onChange={(event) => {
                        setZoneFile(event.target.value);
                        setBulkPreview(null);
                        setReplaceConfirmed(false);
                        setError(null);
                      }}
                      rows={11}
                      spellCheck={false}
                      placeholder={
                        '@ 3600 IN A 192.0.2.1\nwww 3600 IN CNAME example.com.\n_mail._tcp 3600 IN SRV 10 5 443 mail.example.com.'
                      }
                      className="min-h-56 w-full resize-y rounded-md border border-input bg-background/70 p-3 font-mono text-xs leading-6 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum 256 KiB and 200 records. SOA and apex NS are previewed as warnings and
                      never applied.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Structured DNS records
                    </label>
                    <textarea
                      value={jsonRecords}
                      onChange={(event) => {
                        setJsonRecords(event.target.value);
                        setBulkPreview(null);
                        setReplaceConfirmed(false);
                        setError(null);
                      }}
                      rows={11}
                      spellCheck={false}
                      placeholder={
                        '[\n  {\n    "type": "A",\n    "name": "api",\n    "ttl": 300,\n    "data": { "address": "192.0.2.1" }\n  }\n]'
                      }
                      className="min-h-56 w-full resize-y rounded-md border border-input bg-background/70 p-3 font-mono text-xs leading-6 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum 1 MiB and 200 records. Use the same structured data contract as the
                      REST API and SDK.
                    </p>
                  </div>
                )}

                {bulkPreview && (
                  <div className="space-y-3 rounded-md border border-border/70 bg-background/50 p-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <PreviewMetric label="Add" value={bulkPreview.summary.add} />
                      <PreviewMetric label="Update" value={bulkPreview.summary.update} />
                      <PreviewMetric
                        label="Delete"
                        value={bulkPreview.summary.delete}
                        danger={bulkPreview.summary.delete > 0}
                      />
                      <PreviewMetric label="Unchanged" value={bulkPreview.summary.unchanged} />
                      <PreviewMetric
                        label="Final records"
                        value={bulkPreview.summary.finalUserRecords}
                      />
                    </div>
                    {bulkPreview.warnings.length > 0 && (
                      <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-950">
                        {bulkPreview.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    )}
                    {bulkMode === 'replace' && bulkPreview.summary.delete > 0 && (
                      <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={replaceConfirmed}
                          onChange={(event) => setReplaceConfirmed(event.target.checked)}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          I reviewed the preview and confirm deletion of{' '}
                          {bulkPreview.summary.delete} user-managed record(s).
                        </span>
                      </label>
                    )}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBulkOpen(false)}
                    disabled={bulkLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={previewBulk}
                    disabled={
                      bulkLoading || !(bulkEditor === 'zone' ? zoneFile : jsonRecords).trim()
                    }
                  >
                    {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Preview changes
                  </Button>
                  <Button
                    type="button"
                    onClick={applyBulk}
                    disabled={
                      !bulkPreview ||
                      bulkLoading ||
                      (bulkMode === 'replace' &&
                        bulkPreview.summary.delete > 0 &&
                        !replaceConfirmed)
                    }
                  >
                    {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Apply changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 sm:backdrop-blur-sm">
            <div className="safe-bottom premium-surface w-full rounded-t-lg border p-4 shadow-2xl sm:max-w-md sm:rounded-lg sm:p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">Delete DNS record?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This can break routing, email, or verification for this agent.
                  </p>
                  <div className="mt-3 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
                    <div className="font-mono">
                      {deleteTarget.type} {deleteTarget.name}
                    </div>
                    <div className="wrap-anywhere mt-1 font-mono text-muted-foreground">
                      {deleteTarget.value}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteConfirmed}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete record
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DynamicRecordFields({
  form,
  setForm,
}: {
  form: DnsFormState;
  setForm: Dispatch<SetStateAction<DnsFormState>>;
}) {
  const set = <K extends keyof DnsFormState>(key: K, value: DnsFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (form.type === 'A' || form.type === 'AAAA') {
    return (
      <DnsTextField
        label={form.type === 'A' ? 'IPv4 address' : 'IPv6 address'}
        value={form.address}
        onChange={(value) => set('address', value)}
        placeholder={form.type === 'A' ? '192.0.2.1' : '2001:db8::1'}
      />
    );
  }

  if (form.type === 'ALIAS' || form.type === 'CNAME') {
    return (
      <>
        <DnsTextField
          label="Target hostname"
          value={form.target}
          onChange={(value) => set('target', value)}
          placeholder="target.example.com"
        />
        {form.type === 'ALIAS' ? (
          <DnsHint>ALIAS is supported only at the zone apex. Use CNAME for subdomains.</DnsHint>
        ) : (
          <DnsHint>
            CNAME cannot be used at the apex or coexist with other record types at the same owner.
          </DnsHint>
        )}
      </>
    );
  }

  if (form.type === 'CAA') {
    return (
      <div className="grid gap-4 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
        <DnsSelectField
          label="Flag"
          value={String(form.flag)}
          onChange={(value) => set('flag', Number(value) as 0 | 128)}
          options={[
            ['0', '0'],
            ['128', '128'],
          ]}
        />
        <DnsSelectField
          label="Tag"
          value={form.tag}
          onChange={(value) => set('tag', value as DnsFormState['tag'])}
          options={[
            ['issue', 'issue'],
            ['issuewild', 'issuewild'],
            ['iodef', 'iodef'],
          ]}
        />
        <DnsTextField
          label="CA / reporting value"
          value={form.caaValue}
          onChange={(value) => set('caaValue', value)}
          placeholder="letsencrypt.org"
        />
      </div>
    );
  }

  if (form.type === 'HTTPS' || form.type === 'SVCB') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <DnsNumberField
            label="Priority"
            value={form.priority}
            onChange={(value) => set('priority', value)}
            min={0}
            max={65535}
          />
          <DnsTextField
            label="Target hostname"
            value={form.target}
            onChange={(value) => set('target', value)}
            placeholder="svc.example.com or ."
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-muted-foreground">Service parameters</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set('params', [...form.params, { key: '', value: '' }])}
              className="h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add parameter
            </Button>
          </div>
          {form.params.length === 0 ? (
            <DnsHint>
              No service parameters. Priority 0 AliasMode records must remain empty.
            </DnsHint>
          ) : (
            form.params.map((param, index) => (
              <div
                key={`${index}-${param.key}`}
                className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_2.5rem] gap-2"
              >
                <input
                  value={param.key}
                  onChange={(event) =>
                    set(
                      'params',
                      form.params.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="alpn"
                  className={dnsInputClass}
                  required
                />
                <input
                  value={param.value ?? ''}
                  onChange={(event) =>
                    set(
                      'params',
                      form.params.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="h2,h3"
                  className={dnsInputClass}
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'params',
                      form.params.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input text-muted-foreground hover:text-destructive"
                  title="Remove parameter"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (form.type === 'MX') {
    return (
      <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <DnsNumberField
          label="Priority"
          value={form.priority}
          onChange={(value) => set('priority', value)}
          min={0}
          max={65535}
        />
        <DnsTextField
          label="Mail exchange"
          value={form.exchange}
          onChange={(value) => set('exchange', value)}
          placeholder="mail.example.com"
        />
      </div>
    );
  }

  if (form.type === 'NS') {
    return (
      <>
        <DnsTextField
          label="Nameserver"
          value={form.nameserver}
          onChange={(value) => set('nameserver', value)}
          placeholder="ns1.example.net"
        />
        <DnsHint>
          Apex delegation is managed separately at the registrar. This editor accepts NS only below
          the apex.
        </DnsHint>
      </>
    );
  }

  if (form.type === 'PTR') {
    return (
      <>
        <DnsTextField
          label="Pointer hostname"
          value={form.pointer}
          onChange={(value) => set('pointer', value)}
          placeholder="host.example.com"
        />
        <DnsWarning>
          PTR works only when this zone has authority over the matching reverse DNS namespace.
        </DnsWarning>
      </>
    );
  }

  if (form.type === 'SRV') {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <DnsNumberField
          label="Priority"
          value={form.priority}
          onChange={(value) => set('priority', value)}
          min={0}
          max={65535}
        />
        <DnsNumberField
          label="Weight"
          value={form.weight}
          onChange={(value) => set('weight', value)}
          min={0}
          max={65535}
        />
        <DnsNumberField
          label="Port"
          value={form.port}
          onChange={(value) => set('port', value)}
          min={1}
          max={65535}
        />
        <div className="sm:col-span-3">
          <DnsTextField
            label="Target hostname"
            value={form.target}
            onChange={(value) => set('target', value)}
            placeholder="service.example.com"
          />
        </div>
      </div>
    );
  }

  if (form.type === 'TLSA') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <DnsSelectField
            label="Certificate usage"
            value={String(form.usage)}
            onChange={(value) => set('usage', Number(value))}
            options={[
              ['0', '0 - PKIX-TA'],
              ['1', '1 - PKIX-EE'],
              ['2', '2 - DANE-TA'],
              ['3', '3 - DANE-EE'],
            ]}
          />
          <DnsSelectField
            label="Selector"
            value={String(form.selector)}
            onChange={(value) => set('selector', Number(value))}
            options={[
              ['0', '0 - Full certificate'],
              ['1', '1 - SPKI'],
            ]}
          />
          <DnsSelectField
            label="Matching"
            value={String(form.matchingType)}
            onChange={(value) => set('matchingType', Number(value))}
            options={[
              ['0', '0 - Exact'],
              ['1', '1 - SHA-256'],
              ['2', '2 - SHA-512'],
            ]}
          />
        </div>
        <DnsTextField
          label="Certificate association data"
          value={form.associationData}
          onChange={(value) => set('associationData', value)}
          placeholder="Hexadecimal certificate data"
          mono
        />
        <DnsWarning>
          TLSA authenticity depends on DNSSEC. DNSSEC lifecycle management is outside this release.
        </DnsWarning>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Text</label>
      <textarea
        value={form.text}
        onChange={(event) => set('text', event.target.value)}
        rows={4}
        placeholder="Exact TXT value"
        className="w-full resize-y rounded-md border border-input bg-background/70 p-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        required
      />
    </div>
  );
}

const dnsInputClass =
  'h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

function DnsTextField({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${dnsInputClass} ${mono ? 'font-mono text-xs' : ''}`}
        required
      />
    </div>
  );
}

function DnsNumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        min={min}
        max={max}
        className={dnsInputClass}
        required
      />
    </div>
  );
}

function DnsSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={dnsInputClass}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </div>
  );
}

function DnsHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function DnsWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-950">
      {children}
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${danger ? 'text-destructive' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function emptyDnsForm(): DnsFormState {
  return {
    type: 'TXT',
    name: '@',
    ttl: 3600,
    address: '',
    target: '',
    flag: 0,
    tag: 'issue',
    caaValue: '',
    priority: 10,
    exchange: '',
    nameserver: '',
    pointer: '',
    weight: 0,
    port: 443,
    usage: 3,
    selector: 1,
    matchingType: 1,
    associationData: '',
    text: '',
    params: [],
  };
}

function dataFromForm(form: DnsFormState): DnsRecordData {
  switch (form.type) {
    case 'A':
    case 'AAAA':
      return { address: form.address };
    case 'ALIAS':
    case 'CNAME':
      return { target: form.target };
    case 'CAA':
      return { flag: form.flag, tag: form.tag, value: form.caaValue };
    case 'HTTPS':
    case 'SVCB':
      return {
        priority: form.priority,
        target: form.target,
        params: form.params.map((param) => (param.value ? param : { key: param.key })),
      };
    case 'MX':
      return { priority: form.priority, exchange: form.exchange };
    case 'NS':
      return { nameserver: form.nameserver };
    case 'PTR':
      return { pointer: form.pointer };
    case 'SRV':
      return { priority: form.priority, weight: form.weight, port: form.port, target: form.target };
    case 'TLSA':
      return {
        usage: form.usage,
        selector: form.selector,
        matchingType: form.matchingType,
        associationData: form.associationData,
      };
    case 'TXT':
      return { text: form.text };
  }
}

function formFromRecord(record: DnsRecord): DnsFormState {
  const form = {
    ...emptyDnsForm(),
    id: record.id,
    type: record.type,
    name: record.name,
    ttl: record.ttl,
  };
  const data = (record.data ?? legacyData(record)) as Record<string, unknown>;
  form.address = String(data.address ?? '');
  form.target = String(data.target ?? '');
  form.flag = Number(data.flag ?? 0) === 128 ? 128 : 0;
  form.tag = ['issue', 'issuewild', 'iodef'].includes(String(data.tag))
    ? (String(data.tag) as DnsFormState['tag'])
    : 'issue';
  form.caaValue = String(data.value ?? '');
  form.priority = Number(data.priority ?? record.priority ?? 10);
  form.exchange = String(data.exchange ?? '');
  form.nameserver = String(data.nameserver ?? '');
  form.pointer = String(data.pointer ?? '');
  form.weight = Number(data.weight ?? 0);
  form.port = Number(data.port ?? 443);
  form.usage = Number(data.usage ?? 3);
  form.selector = Number(data.selector ?? 1);
  form.matchingType = Number(data.matchingType ?? 1);
  form.associationData = String(data.associationData ?? '');
  form.text = String(data.text ?? '');
  form.params = Array.isArray(data.params) ? (data.params as DnsServiceParam[]) : [];
  return form;
}

function legacyData(record: DnsRecord): DnsRecordData {
  const parts = record.value.trim().split(/\s+/);
  switch (record.type) {
    case 'A':
    case 'AAAA':
      return { address: record.value };
    case 'ALIAS':
    case 'CNAME':
      return { target: record.value };
    case 'CAA':
      return {
        flag: Number(parts[0]) === 128 ? 128 : 0,
        tag: (parts[1] ?? 'issue') as 'issue',
        value: parts.slice(2).join(' '),
      };
    case 'HTTPS':
    case 'SVCB':
      return {
        priority: Number(parts[0] ?? 0),
        target: parts[1] ?? '.',
        params: parts.slice(2).map(parseUiServiceParam),
      };
    case 'MX':
      return { priority: record.priority ?? 10, exchange: record.value };
    case 'NS':
      return { nameserver: record.value };
    case 'PTR':
      return { pointer: record.value };
    case 'SRV':
      return {
        priority: Number(parts[0] ?? 0),
        weight: Number(parts[1] ?? 0),
        port: Number(parts[2] ?? 443),
        target: parts[3] ?? '',
      };
    case 'TLSA':
      return {
        usage: Number(parts[0] ?? 3),
        selector: Number(parts[1] ?? 1),
        matchingType: Number(parts[2] ?? 1),
        associationData: parts.slice(3).join(''),
      };
    case 'TXT':
      return { text: record.value };
  }
}

function parseUiServiceParam(value: string): DnsServiceParam {
  const index = value.indexOf('=');
  return index === -1
    ? { key: value }
    : { key: value.slice(0, index), value: value.slice(index + 1) };
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as { message?: unknown; details?: unknown };
  const message = typeof record.message === 'string' ? record.message : fallback;
  const details =
    typeof record.details === 'string'
      ? record.details
      : record.details && typeof record.details === 'object' && 'message' in record.details
        ? String((record.details as { message?: unknown }).message ?? '')
        : '';
  return `${message}${details ? `: ${details}` : ''}`;
}

function formatTtl(ttl: number) {
  if (ttl % 3600 === 0) return `${ttl / 3600} hour${ttl === 3600 ? '' : 's'}`;
  if (ttl % 60 === 0) return `${ttl / 60} minutes`;
  return `${ttl} seconds`;
}

function showHostingTransitionToast(
  hosting: HostingTransition | null | undefined,
  copy: { title: string; description?: string },
) {
  if (hosting?.status === 'pending') {
    toast.warning(`${copy.title}; routing reconciliation pending`, {
      description: hosting.warning ?? copy.description,
    });
    return;
  }
  toast.success(copy.title, { description: copy.description });
}

const TYPE_ORDER: readonly string[] = DNS_RECORD_TYPES;

function sortRecords(list: DnsRecord[]): DnsRecord[] {
  const owner = (name: string) => (name === '@' ? '' : name.split('.').reverse().join('.'));
  return [...list].sort(
    (a, b) =>
      owner(a.name).localeCompare(owner(b.name)) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.value.localeCompare(b.value),
  );
}

function shortTtl(ttl: number) {
  if (ttl % 3600 === 0) return `${ttl / 3600} h`;
  if (ttl % 60 === 0) return `${ttl / 60} min`;
  return `${ttl} s`;
}

/** One group of records: a table from 768px, cards below. */
function RecordSection({
  title,
  meta,
  records,
  emptyText,
  readOnly = false,
  onEdit,
  onDelete,
}: {
  title: string;
  meta: string;
  records: DnsRecord[];
  emptyText: string;
  readOnly?: boolean;
  onEdit?: (record: DnsRecord) => void;
  onDelete?: (record: DnsRecord) => void;
}) {
  return (
    <section aria-label={title} className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground/90">
          {readOnly ? <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
          {title}
        </h3>
        <span className="text-[12.5px] tabular-nums text-muted-foreground">{meta}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/75">
        {records.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-muted-foreground">{emptyText}</p>
        ) : (
          <>
            <table className="hidden w-full table-fixed text-[13px] md:table">
              <thead>
                <tr className="border-b border-border/70 bg-foreground/[0.025] text-left text-[12px] font-medium text-muted-foreground">
                  <th className="w-[84px] px-4 py-2.5 font-medium">Type</th>
                  <th className="w-[26%] px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Value</th>
                  <th className="w-[72px] px-3 py-2.5 font-medium">TTL</th>
                  <th className="w-[112px] px-4 py-2.5 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="group border-b border-border/60 transition-colors last:border-b-0 hover:bg-foreground/[0.02]"
                  >
                    <td className="px-4 py-3 align-middle">
                      <TypeBadge type={record.type} />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <RecordName name={record.name} />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <RecordValue value={record.value} />
                    </td>
                    <td
                      className="px-3 py-3 align-middle tabular-nums text-muted-foreground"
                      title={formatTtl(record.ttl)}
                    >
                      {shortTtl(record.ttl)}
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      {readOnly ? (
                        <span className="text-[12px] text-muted-foreground">
                          {record.purpose ?? 'managed'}
                        </span>
                      ) : (
                        <RecordActions record={record} onEdit={onEdit} onDelete={onDelete} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="md:hidden">
              {records.map((record) => (
                <li
                  key={record.id}
                  className="border-b border-border/60 px-3.5 py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <TypeBadge type={record.type} />
                      <RecordName name={record.name} />
                    </div>
                    {readOnly ? (
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {record.purpose ?? 'managed'}
                      </span>
                    ) : (
                      <RecordActions record={record} onEdit={onEdit} onDelete={onDelete} />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <RecordValue value={record.value} />
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      {shortTtl(record.ttl)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-md border border-border/80 bg-background/70 px-1.5 font-mono text-[11.5px] font-semibold tracking-wide text-foreground/85">
      {type}
    </span>
  );
}

function RecordName({ name }: { name: string }) {
  if (name === '@') {
    return (
      <span className="inline-flex min-w-0 items-baseline gap-1.5 font-mono text-[13px]">
        @<span className="font-sans text-[12px] text-muted-foreground">root</span>
      </span>
    );
  }
  return (
    <span className="block min-w-0 truncate font-mono text-[13px]" title={name}>
      {name}
    </span>
  );
}

function RecordValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Couldn’t copy', { description: 'Select the value and copy it instead.' });
    }
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 truncate font-mono text-[13px] text-foreground/85" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy value'}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-[hsl(143_45%_32%)]" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </span>
  );
}

function RecordActions({
  record,
  onEdit,
  onDelete,
}: {
  record: DnsRecord;
  onEdit?: (record: DnsRecord) => void;
  onDelete?: (record: DnsRecord) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onEdit?.(record)}
        aria-label={`Edit ${record.type} ${record.name}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Edit2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onDelete?.(record)}
        aria-label={`Delete ${record.type} ${record.name}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
