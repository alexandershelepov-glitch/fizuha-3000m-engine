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

export function useDraft(storage: KeyValueStorage, today: string): DraftStore {
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
