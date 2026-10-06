/** Versioned storage of whole envelopes. Serialized engine data is never parsed or edited here. */
import {ApplicationError} from './appError.ts';
import {parseAppState} from './appState.ts';
import type {AppStateV1} from './appState.ts';
import type {KeyValueStorage} from './storage.ts';
export const ARCHIVED_CYCLES_KEY = 'fizuha.archivedCycles';
export const ARCHIVE_FORMAT_VERSION = 1;
export interface ArchivedCycle {cycleId: string; archivedAt: string; appState: AppStateV1}
export interface ArchiveStoreV1 {formatVersion: 1; cycles: ArchivedCycle[]}
export interface ArchiveRepository {
  list(): ArchivedCycle[];
  get(cycleId: string): ArchivedCycle | null;
  add(appState: AppStateV1, archivedAt: string): ArchivedCycle;
}
export function createArchiveRepository(storage: KeyValueStorage): ArchiveRepository {
  const read = (): ArchiveStoreV1 => {
    let raw: string | null;
    try { raw = storage.getItem(ARCHIVED_CYCLES_KEY); } catch { throw new ApplicationError('ARCHIVE_UNAVAILABLE'); }
    if (raw === null) return {formatVersion: ARCHIVE_FORMAT_VERSION, cycles: []};
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new ApplicationError('ARCHIVE_DAMAGED'); }
    if (typeof data !== 'object' || data === null || !('formatVersion' in data)) throw new ApplicationError('ARCHIVE_DAMAGED');
    if (data.formatVersion !== ARCHIVE_FORMAT_VERSION) throw new ApplicationError('UNSUPPORTED_ARCHIVE_VERSION');
    if (!('cycles' in data) || !Array.isArray(data.cycles)) throw new ApplicationError('ARCHIVE_DAMAGED');
    const ids = new Set<string>();
    for (const entry of data.cycles) {
      if (typeof entry !== 'object' || entry === null || typeof entry.cycleId !== 'string' || typeof entry.archivedAt !== 'string' || !Number.isFinite(Date.parse(entry.archivedAt))) throw new ApplicationError('ARCHIVE_DAMAGED');
      const parsed = parseAppState(entry.appState);
      if (!parsed.ok || parsed.state.cycle.cycleId !== entry.cycleId || ids.has(entry.cycleId)) throw new ApplicationError('ARCHIVE_DAMAGED');
      ids.add(entry.cycleId);
    }
    return data as ArchiveStoreV1;
  };
  return {
    list: () => read().cycles.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
    get: (id) => read().cycles.find(entry => entry.cycleId === id) ?? null,
    add: (appState, archivedAt) => {
      const current = read(); const id = appState.cycle.cycleId;
      const existing = current.cycles.find(entry => entry.cycleId === id);
      if (existing) {
        if (JSON.stringify(existing.appState) !== JSON.stringify(appState)) throw new ApplicationError('ARCHIVE_CONFLICT');
        return existing;
      }
      const entry: ArchivedCycle = {cycleId: id, archivedAt, appState: structuredClone(appState)};
      const raw = JSON.stringify({...current, cycles: [...current.cycles, entry]});
      try {
        storage.setItem(ARCHIVED_CYCLES_KEY, raw);
        if (storage.getItem(ARCHIVED_CYCLES_KEY) !== raw) throw new Error();
      } catch { throw new ApplicationError('ARCHIVE_UNAVAILABLE'); }
      return entry;
    },
  };
}
