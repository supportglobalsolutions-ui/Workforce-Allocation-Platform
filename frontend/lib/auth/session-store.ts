'use client';

// Supabase Auth manages its own session persistence via onAuthStateChange.
// This file is kept for import compatibility but all storage is handled by Supabase.

export function readStoredSession() { return null; }
export function writeStoredSession(_session: unknown) {}
export function subscribeSession(_onChange: () => void) { return () => {}; }
export function getSessionSnapshot() { return null; }
export function getSessionServerSnapshot() { return null; }
