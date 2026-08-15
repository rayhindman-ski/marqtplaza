import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  Search,
  ScanSearch,
  Save,
  MapPin,
  Newspaper,
  CalendarDays,
  Megaphone,
  ExternalLink,
  CheckSquare,
  Square,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { translations, type Language } from '../lib/i18n';
import { SchematicMap } from '../components/SchematicMap';
import { LOCATIONS } from '../lib/data';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Business {
  id: string;
  name: string;
  zipCode: string;
  address: string;
}

interface ScanResult {
  type: string;
  title: string;
  sourceUrl?: string;
  publishedAt?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function typeBadge(type: string, t: (typeof translations)[Language]) {
  const label = t.captureTypeBadge[type] ?? type;
  const Icon =
    type === 'news' ? Newspaper : type === 'event' ? CalendarDays : Megaphone;
  const colors =
    type === 'news'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : type === 'event'
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-orange-50 text-orange-700 border-orange-200';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold',
        colors,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({
  message,
  kind,
  onClose,
}: {
  message: string;
  kind: 'success' | 'error';
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-5 py-3 shadow-xl backdrop-blur-md text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300',
        kind === 'success'
          ? 'bg-card border-green-300 text-green-700'
          : 'bg-card border-destructive/40 text-destructive',
      )}
    >
      <span>{message}</span>
      <button onClick={onClose} className="ml-4 text-muted-foreground hover:text-foreground">
        ✕
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CaptureView({ language }: { language: Language }) {
  const t = translations[language];

  // Search inputs
  const [url, setUrl] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [neighbourhood, setNeighbourhood] = useState('');

  // State
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [scanTargetId, setScanTargetId] = useState<string | null>(null);
  const [locatedId, setLocatedId] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [checkedResults, setCheckedResults] = useState<Set<number>>(new Set());

  // Loading / UI
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const locatedBusiness = businesses.find(b => b.id === locatedId);
  // Pick a matching location from our seed data by zip prefix
  const matchedLocation = locatedBusiness
    ? LOCATIONS.find(loc =>
        loc.postcodes.some(pc =>
          locatedBusiness.zipCode.replace(/\s/g, '').startsWith(pc),
        ),
      ) ?? LOCATIONS[0]
    : LOCATIONS[0];

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleSearch() {
    setSearching(true);
    setCheckedIds(new Set());
    setScanTargetId(null);
    setLocatedId(null);
    setScanResults([]);
    setCheckedResults(new Set());
    try {
      const data = await apiPost<{ businesses: Business[] }>('/capture/search', {
        url: url || undefined,
        businessName: businessName || undefined,
        zipCode: zipCode || undefined,
        neighbourhood: neighbourhood || undefined,
      });
      setBusinesses(data.businesses);
    } catch {
      showToast(t.capturePersistError, 'error');
    } finally {
      setSearching(false);
    }
  }

  async function handleScan() {
    if (!scanTargetId) return;
    const business = businesses.find(b => b.id === scanTargetId);
    setScanning(true);
    setScanResults([]);
    setCheckedResults(new Set());
    try {
      const data = await apiPost<{ results: ScanResult[] }>('/capture/scan', {
        businessId: scanTargetId,
        name: business?.name,
        url: url || undefined,
      });
      setScanResults(data.results);
    } catch {
      showToast(t.capturePersistError, 'error');
    } finally {
      setScanning(false);
    }
  }

  async function handlePersist() {
    if (checkedResults.size === 0) return;
    const selected = scanResults.filter((_, i) => checkedResults.has(i));
    const business = businesses.find(b => b.id === scanTargetId);
    setPersisting(true);
    try {
      const data = await apiPost<{ saved: number }>('/capture/persist', {
        results: selected,
        businessName: business?.name,
        businessUrl: url || undefined,
        zipCode: business?.zipCode,
      });
      showToast(t.capturePersistSuccess(data.saved), 'success');
      setCheckedResults(new Set());
    } catch {
      showToast(t.capturePersistError, 'error');
    } finally {
      setPersisting(false);
    }
  }

  function showToast(message: string, kind: 'success' | 'error') {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleChecked(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleResult(i: number) {
    setCheckedResults(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleAllResults() {
    if (checkedResults.size === scanResults.length) {
      setCheckedResults(new Set());
    } else {
      setCheckedResults(new Set(scanResults.map((_, i) => i)));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-border bg-card/80 backdrop-blur-md z-20">
        <Link href="/">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t.backToSearch}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <ScanSearch className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-lg font-extrabold leading-tight">{t.captureTitle}</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">{t.captureSubtitle}</p>
        </div>
      </header>

      {/* Body — two columns on md+ */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* ── Left panel ── */}
        <div className="flex flex-col w-full md:w-[440px] lg:w-[520px] shrink-0 border-r border-border overflow-y-auto">
          {/* Search inputs */}
          <section className="p-5 border-b border-border bg-card/60">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  {t.captureUrlLabel}
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder={t.captureUrlPlaceholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  {t.captureNameLabel}
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder={t.captureNamePlaceholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  {t.captureZipLabel}
                </label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={e => setZipCode(e.target.value)}
                  placeholder={t.captureZipPlaceholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  {t.captureNeighbourhoodLabel}
                </label>
                <input
                  type="text"
                  value={neighbourhood}
                  onChange={e => setNeighbourhood(e.target.value)}
                  placeholder={t.captureNeighbourhoodPlaceholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Search className="w-4 h-4" />
                {searching ? '…' : t.captureSearch}
              </button>
              <button
                type="button"
                onClick={handleScan}
                disabled={!scanTargetId || scanning}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ScanSearch className="w-4 h-4" />
                {scanning ? '…' : t.captureScan}
              </button>
              <button
                type="button"
                onClick={handlePersist}
                disabled={checkedResults.size === 0 || persisting}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Save className="w-4 h-4" />
                {persisting ? '…' : t.capturePersist}
                {checkedResults.size > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-black text-primary-foreground">
                    {checkedResults.size}
                  </span>
                )}
              </button>
            </div>
          </section>

          {/* Businesses list */}
          <section className="flex-1 overflow-y-auto p-5 border-b border-border">
            {businesses.length > 0 && (
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t.captureBusinessesFound(businesses.length)}
              </p>
            )}
            {businesses.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-8">
                {t.captureNoBusinesses}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {businesses.map(b => {
                const isChecked = checkedIds.has(b.id);
                const isScanTarget = scanTargetId === b.id;
                const isLocated = locatedId === b.id;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                      isChecked
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-card hover:border-primary/30',
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleChecked(b.id)}
                      aria-label={`Select ${b.name}`}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5 text-primary" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.zipCode} · {b.address}</p>
                    </div>

                    {/* Scan toggle + Locate */}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <button
                        type="button"
                        title={t.captureScanToggle}
                        onClick={() => setScanTargetId(isScanTarget ? null : b.id)}
                        className={cn(
                          'rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors',
                          isScanTarget
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-primary',
                        )}
                      >
                        {t.captureScan}
                      </button>
                      {isChecked && (
                        <button
                          type="button"
                          onClick={() => setLocatedId(isLocated ? null : b.id)}
                          className={cn(
                            'flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors',
                            isLocated
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-primary',
                          )}
                        >
                          <MapPin className="w-3 h-3" />
                          {t.captureLocate}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Results panel */}
          <section className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t.captureResultsTitle}
              </p>
              {scanResults.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllResults}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {checkedResults.size === scanResults.length
                    ? t.captureDeselectAll
                    : t.captureSelectAll}
                </button>
              )}
            </div>

            {scanResults.length === 0 && (
              <p className="text-sm text-muted-foreground">{t.captureNoResults}</p>
            )}

            {scanResults.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="w-8 px-3 py-2" />
                      <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">
                        {t.captureColType}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">
                        {t.captureColTitle}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground hidden lg:table-cell">
                        {t.captureColSource}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground hidden sm:table-cell">
                        {t.captureColDate}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResults.map((r, i) => {
                      const checked = checkedResults.has(i);
                      return (
                        <tr
                          key={i}
                          className={cn(
                            'border-b border-border last:border-0 cursor-pointer transition-colors',
                            checked ? 'bg-primary/5' : 'hover:bg-muted/30',
                          )}
                          onClick={() => toggleResult(i)}
                        >
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </td>
                          <td className="px-3 py-2.5">{typeBadge(r.type, t)}</td>
                          <td className="px-3 py-2.5 font-medium max-w-[200px] truncate">
                            {r.title}
                          </td>
                          <td className="px-3 py-2.5 hidden lg:table-cell">
                            {r.sourceUrl ? (
                              <a
                                href={r.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="max-w-[120px] truncate">{r.sourceUrl}</span>
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                            {r.publishedAt ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ── Right panel — Map ── */}
        <div className="relative flex-1 hidden md:block bg-accent/20">
          <SchematicMap
            locationId={matchedLocation.id}
            selectedNeighborhood={neighbourhood || null}
          />
          {locatedBusiness && (
            <div className="absolute top-4 left-4 z-10 rounded-xl bg-card/90 backdrop-blur-md border border-border px-4 py-2.5 shadow-lg">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                {t.captureLocate}
              </p>
              <p className="font-bold text-foreground">{locatedBusiness.name}</p>
              <p className="text-xs text-muted-foreground">{locatedBusiness.address}</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          kind={toast.kind}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
