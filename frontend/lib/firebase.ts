import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth:    Auth            = getAuth(app);
export const db:      Firestore       = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export default app;

/** Canonical Firestore mirror paths — see docs/data-models.md Appendix B */
export const COLLECTIONS = {
  RDP_STATUS:           'rdp_status',
  ACTIVE_SESSIONS:      'active_sessions',
  SHIFT_NOTIFICATIONS:  'shift_notifications',
  SHIFT_NOTIFICATION_ITEMS: 'notifications',
  LEADERBOARD:          'leaderboard',
  LEADERBOARD_CURRENT:  'current_period',
  SYSTEM_ALERTS:        'system_alerts',
} as const;

/** @deprecated PostgreSQL is source of truth — do not read or write these collections */
export const DEPRECATED_COLLECTIONS = [
  'users',
  'sessions',
  'worker_status',
  'notifications',
  'audit_events',
  'payroll',
  'rdp_machines',
  'partners',
] as const;
