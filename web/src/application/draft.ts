/**
 * Draft persistence and identity helpers.
 *
 * The draft is unsaved user input, not cycle state: it never contains engine output and never
 * replaces the envelope of docs/pwa-architecture.md §8. It exists so that a reload in the middle of
 * the questionnaire does not lose the answers (wireframes §0.6).
 */
import {defaultDraft} from './questionnaire.ts';
import type {QuestionnaireDraft} from './questionnaire.ts';
import {QUESTIONNAIRE_DRAFT_KEY, RESULT_DRAFT_KEY} from './storage.ts';
import type {ResultDraft} from './resultForm.ts';
import type {KeyValueStorage} from './storage.ts';

export function loadDraft(storage: KeyValueStorage | null, today: string): QuestionnaireDraft {
  const fallback = defaultDraft(today);
  if (storage === null) return fallback;
  let raw: string | null;
  try { raw = storage.getItem(QUESTIONNAIRE_DRAFT_KEY); } catch { return fallback; }
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    // Merge over the defaults so a draft written by an older build cannot leave fields undefined.
    const previous = parsed as Partial<QuestionnaireDraft>;
    // Old questionnaires had exact numeric answers but no recall mode.
    const legacyExact = previous.qualityRecall === undefined &&
      (Number(previous.qualitySessions8Weeks ?? '0') > 0 || Number(previous.qualityWeeks8Weeks ?? '0') > 0);
    return {...fallback, ...previous, qualityRecall: previous.qualityRecall ?? (legacyExact ? 'EXACT' : 'UNKNOWN')};
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

interface StoredResultDraft {
  readonly workoutId: string;
  readonly draft: ResultDraft;
}

/**
 * Result form draft for one workout. It is dropped as soon as the result is stored, and it is never
 * read by the engine.
 */
export function loadResultDraft(storage: KeyValueStorage | null, workoutId: string): ResultDraft | null {
  if (storage === null) return null;
  let raw: string | null;
  try { raw = storage.getItem(RESULT_DRAFT_KEY); } catch { return null; }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredResultDraft>;
    if (parsed.workoutId !== workoutId || typeof parsed.draft !== 'object' || parsed.draft === null) return null;
    // Previous versions prefilled "0" to mean "not measured". Migrate this old sentinel
    // to a blank optional total; never silently discard measured repeat entries.
    return {...parsed.draft,
      completionConfirmed: parsed.draft.completionConfirmed === true,
      effortConfirmed: parsed.draft.effortConfirmed === true,
      distanceMeters: parsed.draft.distanceMeters === '0' ? '' : parsed.draft.distanceMeters,
    };
  } catch {
    return null;
  }
}

export function saveResultDraft(storage: KeyValueStorage | null, workoutId: string, draft: ResultDraft): void {
  if (storage === null) return;
  try {
    storage.setItem(RESULT_DRAFT_KEY, JSON.stringify({workoutId, draft} satisfies StoredResultDraft));
  } catch {
    // A draft that cannot be stored must never block the form.
  }
}

export function clearResultDraft(storage: KeyValueStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(RESULT_DRAFT_KEY);
  } catch {
    // ignore
  }
}
