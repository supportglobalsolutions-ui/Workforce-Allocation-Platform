'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, X, Check, LayoutDashboard, Star, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  PHONE_DIAL_CODES,
  composeE164,
  dialCodeForCountryName,
  filterNationalNumber,
  parseE164,
  validateE164Phone,
} from '@/lib/phone-country-codes';
import { countryNameList } from '@/lib/countries';
import { apiListSignupCountries } from '@/lib/auth/supabase-auth';
import { filterResidence, validateResidence, RESIDENCE_MAX } from '@/lib/auth/signup-fields';
import {
  MM_NAME_MAX,
  MM_PROVIDER_MAX,
  filterMobileMoneyName,
  filterMobileMoneyProvider,
  hasCompletePayoutDetails,
  validateMobileMoneyName,
  validateMobileMoneyProvider,
} from '@/lib/mobile-money-fields';

interface Worker {
  id: string;
  public_code?: string | null;
  username: string | null;
  display_name: string;
  country: string;
  phone?: string | null;
  residence?: string | null;
  mobile_money_name?: string | null;
  mobile_money_provider?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  pay_tier: string;
  status: string;
  worker_type: string;
  start_date: string;
  created_at: string;
  updated_at: string;
  partner_entity_id: string | null;
  admin_user_id: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Registered',
  partner_worker: 'Partner Worker',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</span>
      <span className="text-sm text-theme-heading font-medium">{value}</span>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-2xl font-black text-theme-heading tracking-tight">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-theme-muted">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const needsPayout = searchParams.get('complete') === 'payout';
  const [worker, setWorker] = useState<Worker | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [form, setForm] = useState({
    username: '',
    country: '',
    phoneDial: '254',
    phoneNational: '',
    residence: '',
    mobileMoneyName: '',
    mobileMoneyProvider: '',
  });

  const applyWorkerToForm = (w: Worker) => {
    const parsed = parseE164(w.phone || '');
    setForm({
      username: w.username ?? '',
      country: w.country,
      phoneDial: parsed?.dial || dialCodeForCountryName(w.country || 'Kenya'),
      phoneNational: parsed?.national || '',
      residence: w.residence || '',
      mobileMoneyName: w.mobile_money_name || '',
      mobileMoneyProvider: w.mobile_money_provider || '',
    });
  };

  useEffect(() => {
    api.get<Worker>('/workers/me')
      .then((w) => {
        setWorker(w);
        applyWorkerToForm(w);
        if (needsPayout || !hasCompletePayoutDetails(w)) {
          setEditing(true);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [needsPayout]);

  // Fetch the picker list only once the form is open — the read-only view
  // shows the saved name and needs no list at all.
  useEffect(() => {
    if (!editing || countries.length) return;
    const fallback = countryNameList();
    apiListSignupCountries()
      .then((rows) => {
        const names = rows.map((row) => row.name).filter(Boolean);
        setCountries(names.length ? names : fallback);
      })
      .catch(() => setCountries(fallback));
  }, [editing, countries.length]);

  const cleanUsername = (v: string) => v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);

  const handleEdit = () => {
    if (!worker) return;
    applyWorkerToForm(worker);
    setSaveError(null);
    setSaveOk(false);
    setEditing(true);
  };

  const handleCancel = () => {
    if (worker) applyWorkerToForm(worker);
    setSaveError(null);
    setSaveOk(false);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!worker) return;
    const username = form.username.trim().toLowerCase();
    const fullPhone = composeE164(form.phoneDial, form.phoneNational);
    const requirePayout = needsPayout || !hasCompletePayoutDetails(worker);
    const mmName = filterMobileMoneyName(form.mobileMoneyName).trim();
    const mmProvider = filterMobileMoneyProvider(form.mobileMoneyProvider).trim();
    const phoneErr = validateE164Phone(fullPhone);
    const residenceErr = form.residence.trim() ? validateResidence(form.residence) : '';
    const mmNameErr = validateMobileMoneyName(mmName, { required: requirePayout });
    const mmProviderErr = validateMobileMoneyProvider(mmProvider, { required: requirePayout });
    if (phoneErr || residenceErr || mmNameErr || mmProviderErr) {
      setSaveOk(false);
      setSaveError(phoneErr || residenceErr || mmNameErr || mmProviderErr);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const updated = await api.patch<Worker>('/workers/me', {
        username: username || undefined,
        display_name: username || undefined,
        country: form.country.trim() || undefined,
        phone: fullPhone,
        residence: form.residence.trim().replace(/\s+/g, ' ') || undefined,
        mobile_money_name: mmName || null,
        mobile_money_provider: mmProvider || null,
      });
      setWorker(updated);
      applyWorkerToForm(updated);
      setSaveOk(true);
      if (hasCompletePayoutDetails(updated)) {
        setEditing(false);
        if (needsPayout) router.replace('/worker/profile');
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Save failed';
      const looksLikeRule =
        /letter|number|special|character|max|digit|only use/i.test(raw);
      setSaveError(looksLikeRule ? 'Could not save. Please check your details and try again.' : raw);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-theme-muted text-sm animate-pulse">Loading profile…</p>
      </div>
    );
  }

  if (error || !worker) {
    return (
      <div className="glass-panel rounded-2xl border border-danger/20 p-6 max-w-lg">
        <p className="text-danger text-sm">{error ?? 'Worker profile not found.'}</p>
      </div>
    );
  }

  const rawName = worker.username || worker.display_name;
  const displayName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '—';
  const initials = rawName ? rawName.slice(0, 2).toUpperCase() : '?';
  const email = session?.email;
  const memberSince = new Date(worker.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const legalName = [worker.first_name, worker.last_name].filter(Boolean).join(' ');

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {(needsPayout || (worker && !hasCompletePayoutDetails(worker))) && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 flex gap-3 items-center">
          <Wallet size={20} className="text-amber-400 shrink-0" />
          <p className="text-sm font-bold text-theme-heading">Add your mobile money details to continue.</p>
        </div>
      )}

      <div className="relative h-44 md:h-52 rounded-2xl overflow-hidden bg-gradient-to-br from-[#032F25] via-[#0A4D3A] to-[#032F25]">
        <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_80%_0%,rgba(212,175,55,0.18),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(500px_220px_at_15%_100%,rgba(63,199,160,0.2),transparent_60%)]" />
      </div>

      <div className="relative -mt-24 md:-mt-28 px-4 md:px-10">
        <div className="glass-panel relative pt-16 pb-8 px-6">
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-emerald-accent to-[#0A4D3A] flex items-center justify-center text-white text-3xl font-black shadow-xl"
            style={{ border: '4px solid var(--card-bg)' }}
          >
            {initials}
            <span className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full bg-gold-accent text-[#032F25] flex items-center justify-center">
              <Star size={13} fill="currentColor" />
            </span>
          </div>

          <Link
            href="/worker/dashboard"
            className="absolute top-5 left-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-accent hover:opacity-80 transition-opacity"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>
          {!editing ? (
            <button
              type="button"
              onClick={handleEdit}
              className="absolute top-5 right-6 btn-primary text-xs py-2 px-4 flex items-center gap-2"
            >
              <Pencil size={14} />
              Edit
            </button>
          ) : (
            <div className="absolute top-5 right-6 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5 disabled:opacity-50"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          <div className="text-center mt-2">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-theme-heading tracking-tight">
              {displayName}
            </h1>
            <p className="text-sm text-theme-muted mt-1.5">{worker.country || '—'}</p>
            <p className="text-sm text-theme-body mt-3">
              {email ?? <span className="text-theme-muted italic">No email on file</span>}
            </p>
          </div>

          <div className="border-t border-theme mt-7 mb-6 mx-2 md:mx-10" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat value={worker.pay_tier} label="Pay Tier" />
            <Stat
              value={
                <span className={worker.status === 'active' ? 'text-emerald-accent' : 'text-theme-muted'}>
                  {worker.status}
                </span>
              }
              label="Status"
            />
            <Stat value={TYPE_LABELS[worker.worker_type] ?? worker.worker_type} label="Worker Type" />
          </div>
        </div>
      </div>

      <div className="glass-panel mt-8 px-6 py-5 flex flex-wrap items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-gold-accent/10 text-gold-accent flex items-center justify-center shrink-0">
          <Star size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-theme-muted">Employment</p>
          <p className="text-sm font-bold text-theme-heading mt-0.5">
            {worker.pay_tier}
            <span className="font-normal text-theme-muted"> · started {new Date(worker.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </p>
        </div>
        <p className="text-sm text-theme-muted ml-auto">Member since {memberSince}.</p>
      </div>

      <div className="mt-10 flex items-end justify-between">
        <h2 className="font-display text-2xl font-bold text-theme-heading tracking-tight">Profile details</h2>
        {!editing && (
          <button
            type="button"
            onClick={handleEdit}
            className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-accent hover:opacity-80 transition-opacity"
          >
            Edit
          </button>
        )}
      </div>

      <div className="glass-panel mt-4 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {editing ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-sm select-none">@</span>
                  <input
                    type="text"
                    placeholder="your_username"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: cleanUsername(e.target.value) }))}
                    className="input-field pl-7"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Country</label>
                <select
                  value={form.country}
                  onChange={(e) => {
                    const next = e.target.value;
                    setForm((f) => ({
                      ...f,
                      country: next,
                      phoneDial: dialCodeForCountryName(next) || f.phoneDial,
                    }));
                  }}
                  className="input-field"
                >
                  <option value="">Select country</option>
                  {/* Keep whatever is already saved selectable, even if it is
                      not on the list (e.g. the "Unassigned" default). */}
                  {form.country && !countries.includes(form.country) && (
                    <option value={form.country}>{form.country}</option>
                  )}
                  {countries.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Phone number</label>
                <div className="flex gap-2">
                  <select
                    value={form.phoneDial}
                    onChange={(e) => setForm((f) => ({ ...f, phoneDial: e.target.value }))}
                    className="input-field w-[11rem] shrink-0"
                    aria-label="Country calling code"
                  >
                    {PHONE_DIAL_CODES.map((c) => (
                      <option key={`${c.iso}-${c.dial}`} value={c.dial}>
                        {c.name} (+{c.dial})
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={form.phoneNational}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNational: filterNationalNumber(e.target.value) }))}
                    placeholder="712345678"
                    className="input-field flex-1"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Place of residence</label>
                <input
                  type="text"
                  maxLength={RESIDENCE_MAX}
                  value={form.residence}
                  onChange={(e) => setForm((f) => ({ ...f, residence: filterResidence(e.target.value) }))}
                  placeholder="City or town"
                  className="input-field"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-theme-muted pt-1">
                  Mobile money payout
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Full name on mobile money</label>
                <input
                  type="text"
                  maxLength={MM_NAME_MAX}
                  value={form.mobileMoneyName}
                  onChange={(e) => setForm((f) => ({ ...f, mobileMoneyName: filterMobileMoneyName(e.target.value) }))}
                  placeholder="Jane Doe"
                  className="input-field"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Provider</label>
                <input
                  type="text"
                  maxLength={MM_PROVIDER_MAX}
                  value={form.mobileMoneyProvider}
                  onChange={(e) => setForm((f) => ({ ...f, mobileMoneyProvider: filterMobileMoneyProvider(e.target.value) }))}
                  placeholder="e.g. Mpesa, MTN"
                  className="input-field"
                />
              </div>
            </>
          ) : (
            <>
              <Field label="Username" value={worker.username ? `@${worker.username}` : <span className="text-theme-muted italic">Not set</span>} />
              <Field label="Legal name" value={legalName || '—'} />
              <Field label="Country" value={worker.country} />
              <Field label="Phone" value={worker.phone || <span className="text-theme-muted italic">Not set</span>} />
              <Field label="Place of residence" value={worker.residence || <span className="text-theme-muted italic">Not set</span>} />
              <Field label="Mobile money name" value={worker.mobile_money_name || <span className="text-theme-muted italic">Not set</span>} />
              <Field label="Provider" value={worker.mobile_money_provider || <span className="text-theme-muted italic">Not set</span>} />
            </>
          )}
          <Field
            label="Email"
            value={email ?? <span className="text-theme-muted italic">—</span>}
          />
          <Field
            label="Last Updated"
            value={new Date(worker.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          />
        </div>

        <div className="border-t border-theme" />

        <div className="grid grid-cols-1 gap-3">
          <Field
            label="Worker ID"
            value={
              worker.public_code ? (
                <span className="font-mono text-sm tracking-wide text-emerald-accent">{worker.public_code}</span>
              ) : (
                <span className="text-theme-muted italic">Not assigned (staff accounts have no worker ID)</span>
              )
            }
          />
          {worker.partner_entity_id && (
            <Field label="Partner Entity ID" value={<span className="font-mono text-xs">{worker.partner_entity_id}</span>} />
          )}
        </div>

        {saveError && (
          <p className="text-danger text-sm font-medium">{saveError}</p>
        )}
        {saveOk && !saveError && (
          <p className="text-emerald-accent text-sm font-medium">Saved.</p>
        )}

        {editing && (
          <div className="sticky bottom-4 z-10 -mx-2 mt-2 rounded-2xl border border-emerald-accent/30 bg-[var(--card-bg)]/95 backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-end gap-3 shadow-lg">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="btn-secondary py-2.5 px-5 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-primary py-2.5 px-8 text-sm font-bold flex items-center gap-2 disabled:opacity-50 min-w-[8.5rem] justify-center"
            >
              <Check size={16} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
