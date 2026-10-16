/**
 * UI copy contract tests.
 *
 * `docs/ui-copy.md` is the single source of truth for user-facing text. These tests keep it honest:
 * every value of every UI-facing public catalog must have a mapping row, no row may name a value
 * that does not exist, and the documented `repeats` rule (B1) must match how the engine actually
 * classifies a session.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ANCHORS, BREAK_REASONS, CAPACITIES, CONFIDENCES, DOSE_UNITS, EFFORT_CUES, ERROR_CODES, EVALUATIONS,
  FEASIBILITIES, FEEDBACK_FIELDS, GATES, MAIN_MODES, PERFORMANCE_MISMATCH_LEVELS, PERFORMANCE_SOURCES,
  PHASES, QUALITY_LEVELS, REASON_CODES, SAFETY_STATUSES, WORKOUT_GOALS, WORKOUT_TYPES, YELLOW_REASONS,
  classify, createEngine, day, recordResult, replan,
} from '../src/index.ts';
import type {Workout} from '../src/index.ts';
import {NOW, dateAfter, experienced, profile as baseProfile} from './helpers.ts';

const DOC = readFileSync(new URL('../docs/ui-copy.md', import.meta.url), 'utf8');

/** Catalogs the PWA must translate or handle exhaustively, and therefore must be documented. */
const UI_CATALOGS: Record<string, readonly string[]> = {
  EVALUATIONS, YELLOW_REASONS, REASON_CODES, PHASES, FEASIBILITIES, GATES, CAPACITIES, QUALITY_LEVELS,
  CONFIDENCES, SAFETY_STATUSES, WORKOUT_TYPES, WORKOUT_GOALS, MAIN_MODES, EFFORT_CUES, ANCHORS, DOSE_UNITS,
  FEEDBACK_FIELDS, BREAK_REASONS, PERFORMANCE_SOURCES, PERFORMANCE_MISMATCH_LEVELS, ERROR_CODES,
};

const HEADERS: Record<string, string[]> = {
  ERROR_CODES: ['Error code', 'Заголовок', 'Текст', 'CTA', 'Параметры'],
  FEEDBACK_FIELDS: ['Поле', 'Название UI', 'Когда показывать', 'Обязательность', 'Подсказка'],
};
const DEFAULT_HEADER = ['Engine value', 'Короткий текст', 'Пояснение', 'Где используется', 'Показывать код'];

type Table = {header: string[]; rows: string[][]};

/** Collect every table that follows a `<!-- catalog: NAME -->` marker. */
function parseTables(markdown: string): Map<string, Table[]> {
  const found = new Map<string, Table[]>();
  const lines = markdown.split('\n');
  let current: Table | null = null;
  for (const line of lines) {
    const marker = /^<!--\s*catalog:\s*([A-Z_]+)\s*-->$/.exec(line.trim());
    if (marker) {
      current = {header: [], rows: []};
      const list = found.get(marker[1]!) ?? [];
      list.push(current);
      found.set(marker[1]!, list);
      continue;
    }
    if (!current) continue;
    // Blank lines are neutral (the marker is separated from its table by one), while the first
    // non-blank line that is not a row ends the table so it cannot absorb the next one.
    if (line.trim() === '') continue;
    if (!line.trimStart().startsWith('|')) { current = null; continue; }
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (cells.every(c => /^-+$/.test(c) || c === '')) continue;   // separator row
    if (current.header.length === 0) { current.header = cells; continue; }
    current.rows.push(cells);
  }
  return found;
}

const TABLES = parseTables(DOC);
const valuesOf = (name: string): string[] =>
  (TABLES.get(name) ?? []).flatMap(t => t.rows.map(r => r[0]!.replace(/`/g, '').trim()));

test('COPY-01 the document exists and every catalog marker is expected', () => {
  assert.ok(DOC.length > 2000, 'docs/ui-copy.md looks empty');
  assert.deepEqual([...TABLES.keys()].sort(), Object.keys(UI_CATALOGS).sort(),
    'the document declares a marker for an unknown catalog, or misses one');
});

for (const [name, catalog] of Object.entries(UI_CATALOGS)) {
  test(`COPY-02 ${name}: every public value is mapped, and nothing else`, () => {
    const tables = TABLES.get(name);
    assert.ok(tables && tables.length > 0, `${name}: no mapping table`);
    const documented = valuesOf(name);
    assert.deepEqual([...documented].sort(), [...catalog].sort(),
      `${name}: mapping is incomplete or names unknown values`);
    assert.equal(new Set(documented).size, documented.length, `${name}: duplicate mapping row`);
    for (const table of tables) {
      assert.deepEqual(table.header, HEADERS[name] ?? DEFAULT_HEADER, `${name}: unexpected table header`);
      for (const row of table.rows) {
        assert.equal(row.length, table.header.length, `${name}: row has a different number of cells: ${row.join(' | ')}`);
        assert.ok(row.every(cell => cell.length > 0), `${name}: an empty cell in row: ${row.join(' | ')}`);
        assert.ok(row[0]!.startsWith('`') && row[0]!.endsWith('`'), `${name}: the engine value must be in backticks: ${row[0]}`);
      }
    }
  });
}

test('COPY-03 the mandatory sets are split into the required groups', () => {
  // Errors are grouped into input / lifecycle / action limits, and the union still covers all codes.
  assert.equal(TABLES.get('ERROR_CODES')!.length, 3, 'ERROR_CODES must be grouped into three tables');
  for (const table of TABLES.get('ERROR_CODES')!) {
    for (const row of table.rows) assert.ok(row[4]!.includes('тех. детали'), 'the parameters column must state tech-detail visibility');
  }
  assert.equal(TABLES.get('FEEDBACK_FIELDS')!.length, 1);
  for (const row of TABLES.get('FEEDBACK_FIELDS')![0]!.rows) {
    assert.ok(row[3]!.length > 0, 'обязательность must be stated for every result field');
  }
});

test('COPY-04 a value that the UI must not translate literally says so', () => {
  for (const name of ['EVALUATIONS', 'YELLOW_REASONS', 'REASON_CODES', 'PHASES', 'FEASIBILITIES', 'GATES', 'WORKOUT_TYPES']) {
    for (const table of TABLES.get(name)!) {
      for (const row of table.rows) {
        assert.ok(!/^(да|yes)$/i.test(row[4]!), `${name}: ${row[0]} must not expose its technical code in the main UI`);
      }
    }
  }
  // Codes are only allowed in the hidden diagnostics block, which the document must describe.
  assert.match(DOC, /скрытый блок диагностики/i);
});

test('COPY-05 the B1 repeats rule is documented as non-blocking with a warning', () => {
  assert.match(DOC, /Отправка не блокируется/, 'the B1 rule must state that submission is not blocked');
  assert.match(DOC, /менее точной/, 'the warning must explain reduced accuracy rather than a worse outcome');
  assert.match(DOC, /speedRangeMps/, 'the triggering condition must be named');
  // The rule must explicitly forbid predicting a classification, and must not use colour as the only signal.
  assert.match(DOC, /не прогнозирует/, 'the copy must forbid predicting the classification');
  assert.match(DOC, /не только цветом|не единственный носитель/i, 'the copy must state that colour is not the only signal');
});

test('COPY-06 the documented repeats rule matches how the engine actually classifies', () => {
  const healthy = () => ({pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false, swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false});
  const result = (w: Workout, withRepeats: boolean) => {
    const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
    const speed = w.speedRangeMps ? (w.speedRangeMps[0] + w.speedRangeMps[1]) / 2 : 3;
    const easyPaced = (w.type === 'EASY' || w.type === 'LONG_EASY') && w.speedRangeMps !== null;
    return {date: w.scheduledDate, completionFraction: 1, sessionRpe: target, safety: healthy(),
      durationMinutes: easyPaced ? 5000 / speed / 60 : 35,
      distanceMeters: 5000, restSeconds: [w.restSeconds], conditions: {}, unexpectedFatigue: false,
      repeats: withRepeats && w.speedRangeMps ? Array.from({length: 5}, () => ({distanceMeters: 600, seconds: 600 / speed})) : []};
  };
  const samples = new Map<string, Workout>();
  const profiles = [
    baseProfile({...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(150)}),
    baseProfile({...experienced, availableRunsPerWeek: 7, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 45, longestUsualRunKm: 12, performance: {timeSeconds: 800, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 780, raceDate: dateAfter(150)}),
    baseProfile({performance: null, raceDate: dateAfter(90)}),
    baseProfile({safety: {...healthy(), pain: 3}, raceDate: dateAfter(60)}),
    baseProfile({...experienced, safety: {...healthy(), otherStop: true}, raceDate: dateAfter(60)}),
  ];
  for (const p of profiles) {
    let s = createEngine(p, NOW);
    for (let i = 0; i < 30; i++) {
      for (const w of s.queue) if (!samples.has(w.type)) samples.set(w.type, w);
      const q = s.queue.find(w => w.countsAsQuality);
      if (q) { try { s = recordResult(s, q.id, result(q, true)); continue; } catch { /* advance below */ } }
      const next = dateAfter(1, s.asOf);
      if (day(next) > day(s.profile.raceDate)) break;
      s = replan(s, next);
    }
  }
  assert.ok(samples.size >= 6, `too few workout types sampled: ${[...samples.keys()].join(', ')}`);
  for (const [type, w] of samples) {
    const empty = classify(w, result(w, false)).evaluation;
    const filled = classify(w, result(w, true)).evaluation;
    if ((w.type === 'EASY' || w.type === 'LONG_EASY') && w.speedRangeMps) {
      assert.equal(empty,'GREEN',`${type}: measured total distance + time is enough to verify continuous pace`);
      assert.equal(filled,'GREEN',`${type}: split data are optional for continuous EASY`);
    } else if (w.speedRangeMps) {
      assert.equal(empty, 'YELLOW', `${type}: paced quality without splits remains unverified`);
      assert.equal(filled, 'GREEN', `${type}: filling quality splits restores a normal evaluation`);
    } else {
      assert.equal(empty, filled, `${type}: without a numeric pace, repeats must not change the evaluation`);
    }
    const documented = DOC.includes(`\`${type}\``);
    assert.ok(documented, `${type} appears in a real queue but has no copy row`);
  }
});
