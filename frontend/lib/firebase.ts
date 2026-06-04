// services/persistence/firebase/firebase.config.ts
// Firebase SDK initialisation for GlobalSolutions Platform
// ─────────────────────────────────────────────────────────
// Uses Firebase v9+ modular SDK. Import only the sub-packages you need
// to keep the client bundle lean.

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth,  type Auth }             from 'firebase/auth';
import { getFirestore, type Firestore }    from 'firebase/firestore';
import { getStorage,  type FirebaseStorage } from 'firebase/storage';

// ── Environment variables ────────────────────────────────
// Set these in your .env.local (frontend) or process.env (backend).
// Never commit real keys — this file reads from the environment only.

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? '',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? '',
};

// ── Singleton initialisation (safe for Next.js hot-reload) ──
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ── Exported service instances ───────────────────────────
export const auth:    Auth            = getAuth(app);
export const db:      Firestore       = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export default app;

// ── Firestore collection name constants ──────────────────
// Use these instead of raw strings everywhere in the codebase.
export const COLLECTIONS = {
  SESSIONS:       'sessions',       // Active / historical RDP sessions
  WORKER_STATUS:  'worker_status',  // Real-time online/offline heartbeats
  NOTIFICATIONS:  'notifications',  // Push notification queue
  AUDIT_EVENTS:   'audit_events',   // Lightweight real-time audit stream
} as const;
