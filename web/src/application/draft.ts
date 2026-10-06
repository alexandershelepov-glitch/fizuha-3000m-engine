/**
 * Draft persistence and identity helpers.
 *
 * The draft is unsaved user input, not cycle state: it never contains engine output and never
 * replaces the envelope of docs/pwa-architecture.md §8. It exists so that a reload in the middle of
 * the questionnaire does not lose the answers (wireframes §0.6).
 */
import {defaultDraft} from './questionnaire.ts';
import type {QuestionnaireDraft} from './questionnaire.ts';
import {QUESTIONNAIRE_DRAFT_KEY} from './storage.ts';
import type {KeyValueStorage} from './storage.ts';

export function loadDraft(storage: KeyValueStorage | null, today: string): QuestionnaireDraft {
  const fallback = defaultDraft(today);
  if (storage === null) return fallback;
  const raw = storage.getItem(QUESTIONNAIRE_DRAFT_KEY);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    // Merge over the defaults so a draft written by an older build cannot leave fields undefined.
    return {...fallback, ...(parsed as Partial<QuestionnaireDraft>)};
  } catch {
    return fallback;
  }
}

export function saveDraft(storage: KeyValueStorage | null, draft: QuestionnaireDraft): void {
  if (storage === null) return;
  try {
    storage.setItem(QUESTIONNAIRE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A draft that cannot be stored must never block the questionnaire.
  }
}

export function clearDraft(storage: KeyValueStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(QUESTIONNAIRE_DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** Cycle identity. `crypto.randomUUID` exists in every secure context a PWA runs in. */
export function newCycleId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `cycle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
