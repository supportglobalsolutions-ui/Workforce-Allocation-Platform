import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

function policy(storage = new Map()) {
  const context = createContext({
    exports: {},
    window: { localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    } },
  });
  const source = readFileSync(new URL('../lib/auth/inactivity.ts', import.meta.url), 'utf8');
  runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}

test('expires at 15 minutes, including after a sleeping browser wakes', () => {
  const p = policy();
  const start = 1_000_000;
  assert.equal(p.remainingIdleMs(start, start + p.IDLE_TIMEOUT_MS - 1), 1);
  assert.equal(p.remainingIdleMs(start, start + p.IDLE_TIMEOUT_MS), 0);
  assert.equal(p.remainingIdleMs(start, start + 86_400_000), 0);
});

test('reopening a browser does not renew expired activity', () => {
  const storage = new Map();
  const p = policy(storage);
  p.writeActivity('worker', 1_000_000);
  const reopened = policy(storage);
  assert.equal(reopened.isIdleExpired('worker', 1_000_000 + p.IDLE_TIMEOUT_MS), true);
  assert.equal(reopened.readActivity('worker'), 1_000_000);
});

test('activity is shared across tabs and scoped to the account', () => {
  const storage = new Map();
  const first = policy(storage);
  const second = policy(storage);
  first.writeActivity('worker', 1_000_000);
  second.writeActivity('worker', 1_100_000);
  assert.equal(first.readActivity('worker'), 1_100_000);
  assert.equal(first.readActivity('admin'), null);
});

test('fresh login resets expiry while legacy sessions are initialized only once', () => {
  const p = policy();
  assert.equal(p.isIdleExpired('worker', 1_000_000), false);
  assert.equal(p.isIdleExpired('worker', 1_000_000 + p.IDLE_TIMEOUT_MS), true);
  p.writeActivity('worker', 2_000_000);
  assert.equal(p.isIdleExpired('worker', 2_000_001), false);
});

test('invalid or future timestamps cannot indefinitely extend a session', () => {
  const p = policy();
  assert.equal(p.remainingIdleMs(NaN, 1_000_000), 0);
  assert.equal(p.remainingIdleMs(Infinity, 1_000_000), 0);
  assert.equal(p.remainingIdleMs(2_000_000, 1_000_000), 0);
});

test('returning activity cannot revive an expired tab; other tabs see expiry', () => {
  let now = 1_000_000;
  const storage = new Map();
  const listeners = new Map();
  const p = policy(storage);
  p.writeActivity('worker', now);
  let expired = 0;
  const context = createContext({
    exports: {},
    Date: class extends Date { static now() { return now; } },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener() {}, setInterval() { return 1; }, clearInterval() {},
    },
    require: (name) => {
      if (name === 'react') return { useState: (initial) => [initial, () => {}], useEffect: (effect) => effect() };
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (name === '@/lib/auth/inactivity') return {
        ...p, remainingIdleMs: (activity) => p.remainingIdleMs(activity, now),
        writeActivity: (uid, timestamp = now) => p.writeActivity(uid, timestamp),
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const source = readFileSync(new URL('../components/auth/SessionInactivity.tsx', import.meta.url), 'utf8');
  runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  context.exports.default({ uid: 'worker', onExpire: () => { expired++; } });
  now += p.IDLE_TIMEOUT_MS;
  listeners.get('pointerdown')({ isTrusted: true });
  assert.equal(expired, 1);
  assert.equal(p.readActivity('worker'), 0);
  listeners.get('focus')();
  listeners.get('storage')({ key: p.activityKey('worker') });
  assert.equal(expired, 1);
  assert.equal(policy(storage).isIdleExpired('worker', now), true);
});
