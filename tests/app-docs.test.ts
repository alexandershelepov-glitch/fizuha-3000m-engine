/**
 * The archive storage policy is a normative decision, so the documents that state it are checked
 * against the implementation and against each other. The defect this guards against is a document
 * that keeps describing a bounded archive after the decision changed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const DOCUMENTS = ['docs/pwa-architecture.md', 'docs/final-lifecycle.md', 'docs/wireframes.md', 'docs/ui-copy.md'];

test('DOCS-01 no document promises a bounded archive', () => {
  for (const path of DOCUMENTS) {
    const text = read(path);
    for (const claim of [/последни[ех]\s*5/i, /5\s*циклов/i, /пять\s*циклов/i, /ограничивается\s+настройкой/i, /хранится\s+не\s+более/i]) {
      assert.equal(claim.test(text), false, `${path} must not claim a bounded archive (${String(claim)})`);
    }
  }
});

test('DOCS-02 the architecture fixes the decision and names the container', () => {
  const architecture = read('docs/pwa-architecture.md');

  // The storage table describes the versioned container, not a bare AppStateV1.
  assert.ok(/`fizuha\.archivedCycles` \| `ArchiveStoreV1`/.test(architecture), 'the storage table must name the container');
  assert.ok(/ArchiveStoreV1/.test(architecture));

  // The decision itself: every completed cycle is kept and there is no hard limit in the MVP.
  assert.ok(/хранит \*\*все\*\* завершённые циклы/.test(architecture), 'the rule must keep every completed cycle');
  assert.ok(/[Hh]ard limit/.test(architecture), 'the absence of a hard limit must be stated');
  assert.ok(/автоматическое удаление/.test(architecture), 'the absence of automatic deletion must be stated');

  // B6 is no longer an open question.
  const b6 = architecture.split('\n').find((line) => line.startsWith('| B6 '));
  assert.ok(b6 !== undefined, 'B6 must still be listed');
  assert.ok(/\*\*закрыт\*\*/.test(b6!), 'B6 must be marked as closed');
  assert.equal(/последние 5/.test(b6!), false);
});

test('DOCS-03 the lifecycle document describes the same storage', () => {
  const lifecycle = read('docs/final-lifecycle.md');
  assert.ok(/ArchiveStoreV1/.test(lifecycle), 'the container must be named here too');
  assert.ok(/Нет ограничения на количество циклов/.test(lifecycle), 'the policy must be stated explicitly');
  assert.ok(/formatVersion: 1/.test(lifecycle), 'the documented shape must match the format version');
  assert.ok(/appState: AppStateV1/.test(lifecycle), 'one archive record holds a full AppStateV1');
});

test('DOCS-04 the documented container matches the implementation', () => {
  const source = read('web/src/application/archiveStorage.ts');

  assert.ok(/ARCHIVED_CYCLES_KEY = 'fizuha\.archivedCycles'/.test(source), 'the key must match the documents');
  assert.ok(/ARCHIVE_FORMAT_VERSION = 1/.test(source), 'the format version must match the documents');
  assert.ok(/interface ArchiveStoreV1 \{formatVersion: 1; cycles: ArchivedCycle\[\]\}/.test(source), 'the container shape must match');
  assert.ok(/interface ArchivedCycle \{cycleId: string; archivedAt: string; appState: AppStateV1\}/.test(source), 'one record holds cycleId, archivedAt and the full AppStateV1');

  // Appending is the only way the archive grows: no truncation, eviction or limit anywhere.
  assert.equal(/\.slice\(|\.splice\(|\.pop\(|\.shift\(/.test(source), false, 'the archive must never drop records');
  assert.ok(/cycles: \[\.\.\.current\.cycles, entry\]/.test(source), 'adding a cycle must append it');
  assert.ok(/engineState/.test(source) === false || /opaque|never parsed or edited/.test(source), 'serialized engine data stays opaque here');
});

test('DOCS-05 the no-limit regression test is still in place', () => {
  const suite = read('tests/app-lifecycle.test.ts');
  assert.ok(
    /ARCHIVE all cycles, newest first, independent baseline and no hard limit/.test(suite),
    'the regression that proves the absence of a hard limit must not be removed',
  );
  assert.ok(/i\s*<\s*12/.test(suite), 'it must still archive twelve cycles');
  assert.ok(/assert\.equal\(read\.length,\s*12\)/.test(suite), 'and still assert that all twelve are kept');
});
