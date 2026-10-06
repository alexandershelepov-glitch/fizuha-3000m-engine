/** Draft state for the questionnaire, persisted so a reload does not lose the answers. */
import {useCallback, useState} from 'react';
import {clearDraft, loadDraft, saveDraft} from '../application/draft.ts';
import type {QuestionnaireDraft} from '../application/questionnaire.ts';
import type {KeyValueStorage} from '../application/storage.ts';

export interface DraftStore {
  readonly draft: QuestionnaireDraft;
  update(patch: Partial<QuestionnaireDraft>): void;
  reset(today: string): void;
}

/**
 * The draft lives in the same permanent storage as the cycle. When there is none, the questionnaire
 * still works but nothing is persisted — the shell never pretends that temporary memory is storage.
 */
export function useDraft(storage: KeyValueStorage | null, today: string): DraftStore {
  const [draft, setDraft] = useState<QuestionnaireDraft>(() => loadDraft(storage, today));

  const update = useCallback((patch: Partial<QuestionnaireDraft>) => {
    setDraft((previous) => {
      const next = {...previous, ...patch};
      saveDraft(storage, next);
      return next;
    });
  }, [storage]);

  const reset = useCallback((nextToday: string) => {
    clearDraft(storage);
    setDraft(loadDraft(storage, nextToday));
  }, [storage]);

  return {draft, update, reset};
}
