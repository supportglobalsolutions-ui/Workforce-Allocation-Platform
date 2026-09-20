'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import GlobalSolutionsLogo from '@/components/landing/GlobalSolutionsLogo';
import AuthPageShell, { AuthGlassCard } from '@/components/landing/AuthPageShell';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { apiRegisterUser, apiListSignupCountries, requestSignupOtp, verifySignupOtp } from '@/lib/auth/supabase-auth';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { ROLE_LANDING } from '@/lib/navigation/config';
import {
  EMAIL_MAX,
  NAME_MAX,
  PASSWORD_MAX,
  RESIDENCE_MAX,
  USERNAME_MAX,
  filterName,
  filterNationalNumber,
  filterResidence,
  filterUsername,
  composeE164,
  validateConfirmPassword,
  validateCountry,
  validateEmail,
  validateName,
  validatePhone,
  validateResidence,
  validateUsername,
  passwordRuleErrors,
  type SignupField,
} from '@/lib/auth/signup-fields';
import {
  PHONE_DIAL_CODES,
  dialCodeForCountryName,
} from '@/lib/phone-country-codes';
import { countryNameList } from '@/lib/countries';

type Step = 'email' | 'code' | 'password' | 'done';

export default function SignupPage() {
  const { session } = useAuth();
  // Signup always uses the dark auth shell, independent of dashboard theme.
  const isDark = true;
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [resendsLeft, setResendsLeft] = useState(5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDial, setPhoneDial] = useState('254');
  const [phoneNational, setPhoneNational] = useState('');
  const [country, setCountry] = useState('');
  const [residence, setResidence] = useState('');
  const [username, setUsername] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupField, string>>>({});

  const clearField = (field: SignupField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    if (!session) return;
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [session, router]);

  useEffect(() => {
    if (step !== 'password' || countries.length) return;
    const fallback = countryNameList();
    apiListSignupCountries()
      .then((rows) => {
        const names = rows.map((row) => row.name).filter(Boolean);
        setCountries(names.length ? names : fallback);
      })
      .catch(() => setCountries(fallback));
  }, [step, countries.length]);

  // Shared control chrome without width — phone row needs dial + national side by side.
  const controlClass = isDark
    ? 'bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all'
    : 'bg-emerald-50/80 text-emerald-950 placeholder-emerald-800/35 text-sm rounded-xl py-3 border border-emerald-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none transition-all';

  const labelClass = isDark
    ? 'text-[10px] font-bold uppercase tracking-wider text-[#d4af37] mb-1.5 block'
    : 'text-[10px] font-bold uppercase tracking-wider text-emerald-800/55 mb-1.5 block';

  const fieldInput = (field: SignupField, extra = 'pl-4') =>
    `w-full ${controlClass} ${extra} ${fieldErrors[field] ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : ''}`;

  const phoneErrorClass = fieldErrors.phone
    ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
    : '';

  const phonePreview = phoneNational.trim()
    ? composeE164(phoneDial, phoneNational)
    : '';

  const sendCode = async (resend: boolean) => {
    setError('');
    setSendingCode(true);
    setStep('code');
    try {
      const result = await requestSignupOtp(email, resend);
      setSentTo(result.sent_to);
      setResendsLeft(result.resends_remaining ?? 5);
      setCode('');
    } catch (err: unknown) {
      if (!resend) setStep('email');
      setError(getAuthErrorMessage(err));
    } finally {
      setSendingCode(false);
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || sendingCode) return;
    const emailError = validateEmail(email);
    if (emailError) {
      setFieldErrors({ email: emailError });
      setError(emailError);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    await sendCode(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || sendingCode) return;
    setError('');
    setLoading(true);
    try {
      const result = await verifySignupOtp(email, code);
      setVerificationToken(result.verification_token);
      setStep('password');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const fullPhone = composeE164(phoneDial, phoneNational);
    const passwordBroken = passwordRuleErrors(password);
    const phoneError = !phoneNational.trim()
      ? 'Phone number is required.'
      : validatePhone(fullPhone);
    const nextErrors: Partial<Record<SignupField, string>> = {
      firstName: validateName(firstName, 'First name'),
      lastName: validateName(lastName, 'Last name'),
      phone: phoneError,
      country: validateCountry(country, countries),
      residence: validateResidence(residence),
      username: validateUsername(username),
      password: passwordBroken.length ? passwordBroken[0] : '',
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    };
    const messages = Object.values(nextErrors).filter(Boolean);
    setFieldErrors(nextErrors);
    if (messages.length) {
      const banner = [nextErrors.firstName, nextErrors.lastName, nextErrors.phone, nextErrors.country, nextErrors.residence, nextErrors.username, nextErrors.confirmPassword].find(Boolean);
      setError(banner || '');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apiRegisterUser({
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim().replace(/\s+/g, ' '),
        lastName: lastName.trim().replace(/\s+/g, ' '),
        phone: fullPhone,
        country: country.trim(),
        residence: residence.trim().replace(/\s+/g, ' '),
        username: username.trim() || undefined,
        verificationToken,
      });
      setStep('done');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Do not gate the form on auth bootstrap. A hung cookie sync / dead API
  // used to leave this page on SpinningDots forever; login already paints
  // immediately and only redirects once a session exists.
  if (step === 'done') {
    return (
      <AuthPageShell>
        <AuthGlassCard className="text-center">
          <CheckCircle size={40} className="mx-auto text-[#0df5c4] mb-4" />
          <h1 className="text-xl sm:text-2xl font-display font-bold mb-2">Account created</h1>
          <p className={`text-sm mb-6 ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/60'}`}>
            Your account is pending admin approval. You cannot sign in until an administrator
            approves your account.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] transition-all"
          >
            Back to sign in
            <ArrowRight size={16} />
          </Link>
        </AuthGlassCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthGlassCard wide={step === 'password'} className="max-h-[88vh] overflow-y-auto">
        <div className="flex flex-col items-center text-center mb-6">
          <GlobalSolutionsLogo size="md" title="Create account" showOperations={false} />
        </div>

        {step === 'email' && (
          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                <input
                  type="email"
                  required
                  maxLength={EMAIL_MAX}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value.slice(0, EMAIL_MAX));
                    clearField('email');
                  }}
                  placeholder="you@globalsolutions.com"
                  autoComplete="email"
                  className={fieldInput('email', 'pl-10')}
                />
              </div>
              {fieldErrors.email && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.email}</p>}
              <p className={`mt-2 text-[11px] ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/55'}`}>
                We’ll send a verification code before the account is created.
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading ? <SpinningDots size="md" className="text-[#01241c]" /> : 'Send verification code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-[#0df5c4]">
              <ShieldCheck size={16} />
              <span className="text-sm font-bold">
                {sendingCode ? 'Sending verification code…' : 'Check your email'}
              </span>
            </div>
            <p className={`text-xs text-center ${isDark ? 'text-[#c7d9d3]' : 'text-emerald-800/60'}`}>
              {sendingCode ? 'Sending a 6-digit code to ' : 'Enter the 6-digit code sent to '}
              <span className="font-semibold text-white">{sentTo || email}</span>.
            </p>
            <div>
              <label className={labelClass}>Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                disabled={sendingCode}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                placeholder={sendingCode ? 'Sending…' : '••••••'}
                className={`w-full ${controlClass} pl-4 tracking-[0.35em] text-center font-mono text-lg disabled:opacity-60`}
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || sendingCode || code.length < 6}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading || sendingCode ? (
                <SpinningDots size="md" className="text-[#01241c]" />
              ) : (
                'Verify email'
              )}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); setCode(''); }}
                className="text-[#c7d9d3] hover:text-[#0df5c4]"
              >
                ← Change email
              </button>
              <button
                type="button"
                disabled={loading || sendingCode || resendsLeft <= 0}
                onClick={() => { void sendCode(true); }}
                className="text-[#0df5c4] hover:underline font-semibold disabled:opacity-50"
              >
                {resendsLeft <= 0 ? 'No resends left' : `Resend code (${resendsLeft})`}
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-xs text-center text-[#98b7af]">
              Email confirmed. Add your details, then choose a password. An administrator will approve the account before you can sign in.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>First name</label>
                <input
                  required
                  maxLength={NAME_MAX}
                  value={firstName}
                  onChange={(e) => { setFirstName(filterName(e.target.value)); clearField('firstName'); }}
                  placeholder="First name"
                  autoComplete="given-name"
                  className={fieldInput('firstName')}
                />
                {fieldErrors.firstName && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.firstName}</p>}
              </div>
              <div>
                <label className={labelClass}>Last name</label>
                <input
                  required
                  maxLength={NAME_MAX}
                  value={lastName}
                  onChange={(e) => { setLastName(filterName(e.target.value)); clearField('lastName'); }}
                  placeholder="Last name"
                  autoComplete="family-name"
                  className={fieldInput('lastName')}
                />
                {fieldErrors.lastName && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.lastName}</p>}
              </div>
              <div>
                <label className={labelClass}>
                  Phone number <span className="text-red-400" aria-hidden>*</span>
                </label>
                <div className="flex items-stretch gap-2 min-w-0">
                  <select
                    required
                    value={phoneDial}
                    onChange={(e) => { setPhoneDial(e.target.value); clearField('phone'); }}
                    className={`${controlClass} pl-3 pr-2 w-[8.75rem] shrink-0 ${phoneErrorClass}`}
                    aria-label="Country calling code (required)"
                  >
                    {PHONE_DIAL_CODES.map((c) => (
                      <option key={`${c.iso}-${c.dial}`} value={c.dial}>
                        {c.name} (+{c.dial})
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    maxLength={12}
                    value={phoneNational}
                    onChange={(e) => { setPhoneNational(filterNationalNumber(e.target.value)); clearField('phone'); }}
                    placeholder="714516132"
                    className={`${controlClass} pl-4 pr-4 min-w-0 flex-1 ${phoneErrorClass}`}
                    aria-required="true"
                    aria-describedby="signup-phone-preview"
                  />
                </div>
                <p
                  id="signup-phone-preview"
                  className={`mt-1.5 text-[11px] font-mono tracking-wide ${
                    phonePreview
                      ? (isDark ? 'text-[#0df5c4]' : 'text-emerald-700')
                      : (isDark ? 'text-[#98b7af]' : 'text-emerald-800/55')
                  }`}
                >
                  {phonePreview || 'Enter your number next to the code — e.g. +254714516132'}
                </p>
                {fieldErrors.phone && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.phone}</p>}
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <select
                  required
                  value={country}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCountry(next);
                    setPhoneDial(dialCodeForCountryName(next));
                    clearField('country');
                    clearField('phone');
                  }}
                  className={fieldInput('country')}
                >
                  <option value="">Select country</option>
                  {countries.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {fieldErrors.country && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.country}</p>}
              </div>
              <div>
                <label className={labelClass}>Place of residence</label>
                <input
                  required
                  maxLength={RESIDENCE_MAX}
                  value={residence}
                  onChange={(e) => { setResidence(filterResidence(e.target.value)); clearField('residence'); }}
                  placeholder="City or town"
                  autoComplete="address-level2"
                  className={fieldInput('residence')}
                />
                {fieldErrors.residence && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.residence}</p>}
              </div>
              <div>
                <label className={labelClass}>Username</label>
                <input
                  maxLength={USERNAME_MAX}
                  value={username}
                  onChange={(e) => { setUsername(filterUsername(e.target.value)); clearField('username'); }}
                  placeholder="Optional, 3–32 characters"
                  autoComplete="username"
                  className={fieldInput('username')}
                />
                {fieldErrors.username && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.username}</p>}
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    maxLength={PASSWORD_MAX}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value.slice(0, PASSWORD_MAX));
                      clearField('password');
                      clearField('confirmPassword');
                    }}
                    placeholder="Password"
                    className={fieldInput('password', 'pr-10')}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98b7af] hover:text-[#0df5c4] transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {(password.length > 0 || fieldErrors.password) && passwordRuleErrors(password).length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-red-400">
                    {passwordRuleErrors(password).map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className={labelClass}>Confirm password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70 pointer-events-none" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    maxLength={PASSWORD_MAX}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value.slice(0, PASSWORD_MAX));
                      clearField('confirmPassword');
                    }}
                    placeholder="Re-enter password"
                    className={fieldInput('confirmPassword', 'pr-10')}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98b7af] hover:text-[#0df5c4] transition-colors"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p className="mt-1 text-[11px] text-red-400">{fieldErrors.confirmPassword}</p>}
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || (password.length > 0 && passwordRuleErrors(password).length > 0)}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading ? (
                <SpinningDots size="md" className="text-[#01241c]" />
              ) : (
                <>
                  <UserPlus size={17} strokeWidth={2.5} />
                  <span>Create account</span>
                </>
              )}
            </button>
          </form>
        )}

        <p className={`text-center text-xs mt-5 ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/55'}`}>
          Already have an account?{' '}
          <Link href="/login" className="text-[#0df5c4] hover:underline font-semibold ml-1">
            Sign in
          </Link>
        </p>
      </AuthGlassCard>
    </AuthPageShell>
  );
}
