/**
 * Wireframe document integrity tests.
 *
 * `docs/wireframes.md` is the basis for frontend work, so it must be complete and internally
 * consistent: every screen must answer "what do I see / what can I do / what happens next", every
 * referenced screen must exist, and every verification scenario must be covered.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const DOC = readFileSync(new URL('../docs/wireframes.md', import.meta.url), 'utf8');
const LINES = DOC.split('\n');

const ID = String.raw`WF-\d+(?:\.[A-Za-z]+)?`;
const REQUIRED_BLOCKS = ['[Entry]', '[Верхняя часть]', '[Основной блок]', '[Основной CTA]', '[Дополнительные действия]', '[Переходы]'];

/** Sections headed `### WF-NN — Title`: a top-level screen, not a state of another screen. */
const screens = new Map<string, string>();
{
  let current: {id: string; body: string[]} | null = null;
  for (const line of LINES) {
    const top = /^### (WF-\d+) — (.*)$/.exec(line);
    if (/^#{1,4} /.test(line) && !top) { if (current) { screens.set(current.id, current.body.join('\n')); current = null; } }
    if (top) { if (current) screens.set(current.id, current.body.join('\n')); current = {id: top[1]!, body: [line]}; continue; }
    if (current) current.body.push(line);
  }
  if (current) screens.set(current.id, current.body.join('\n'));
}

/** IDs defined anywhere: headings, or the first cell of a documented state table. */
const defined = new Set<string>();
for (const line of LINES) {
  const heading = new RegExp(`^#{3,4} (${ID}) — `).exec(line);
  if (heading) defined.add(heading[1]!);
  if (line.trimStart().startsWith('|')) {
    const first = line.trim().replace(/^\|/, '').split('|')[0]!.trim();
    if (new RegExp(`^${ID}$`).test(first)) defined.add(first);
  }
}

/** Every ID mentioned anywhere in the document. */
const mentioned = new Set(DOC.match(new RegExp(ID, 'g')) ?? []);

test('WIRE-01 every screen has a unique id and answers the three questions', () => {
  assert.ok(screens.size >= 25, `too few screens parsed: ${screens.size}`);
  const ids = [...screens.keys()];
  assert.equal(new Set(ids).size, ids.length, 'duplicate screen id');
  for (const [id, body] of screens) {
    for (const block of REQUIRED_BLOCKS) {
      assert.ok(body.includes(block), `${id}: missing ${block}`);
    }
    // Each screen must state where it can go, otherwise it is a dead end.
    const transitions = body.slice(body.indexOf('[Переходы]'));
    assert.ok(new RegExp(ID).test(transitions), `${id}: no screen is reachable from its transitions`);
  }
});

test('WIRE-02 no reference points at a screen or state that does not exist', () => {
  const dangling = [...mentioned].filter(id => !defined.has(id));
  assert.deepEqual(dangling.sort(), [], `dangling references: ${dangling.join(', ')}`);
  for (const id of ['WF-01', 'WF-13', 'WF-32']) assert.ok(defined.has(id), `${id} must be defined`);
});

test('WIRE-03 every state of the main screen is defined and reachable', () => {
  // WF-13.D is the post-skip confirmation screen, reached from WF-16 rather than by data,
  // so it is defined and inventoried but not part of the renderer's selection order.
  const states = ['WF-13.A', 'WF-13.B', 'WF-13.C', 'WF-13.E', 'WF-13.F', 'WF-13.G', 'WF-13.H', 'WF-13.I', 'WF-13.K', 'WF-13.L'];
  assert.ok(defined.has('WF-13.D'), 'WF-13.D must still be defined');
  for (const state of states) assert.ok(defined.has(state), `${state} is not defined`);
  // The selection order must mention each of them, so the renderer is unambiguous.
  const order = DOC.slice(DOC.indexOf('Порядок выбора состояния'), DOC.indexOf('### WF-13.A'));
  for (const state of states) assert.ok(order.includes(state), `${state} is missing from the state-selection order`);
});

test('WIRE-04 the bottom navigation is the four required sections with Today as the main one', () => {
  assert.match(DOC, /Нижняя навигация: Сегодня · План · История · Профиль/);
  assert.match(DOC, /Главный раздел — «Сегодня»/);
  assert.match(DOC, /открывается по умолчанию/);
  assert.match(DOC, /Нижняя навигация скрыта на всех экранах онбординга/);
});

test('WIRE-05 the transition map uses the documented cycle states', () => {
  const map = DOC.slice(DOC.indexOf('## 6. Master transition map'), DOC.indexOf('## 7. Screen inventory'));
  for (const state of ['ACTIVE', 'AWAITING_FINAL_RESULT', 'COMPLETED']) {
    assert.ok(map.includes(state), `the transition map must use the documented cycle state ${state}`);
  }
  for (const state of ['FIRST_RUN', 'QUESTIONNAIRE', 'REVIEW', 'ASSESSMENT', 'PLAN_READY', 'PENDING_RESULT', 'RACE_DAY', 'TAPER']) {
    assert.ok(map.includes(state), `the transition map must cover ${state}`);
  }
  // Automatic cycle transitions must be explicitly ruled out.
  assert.match(map, /только по явному действию/i);
});

test('WIRE-06 the inventory lists every screen with entry condition, CTA and next state', () => {
  const start = DOC.indexOf('## 7. Screen inventory');
  const table = DOC.slice(start, DOC.indexOf('## 8. Проверка сценариев')).split('\n').filter(l => l.trimStart().startsWith('|'));
  const rows = table.filter(l => new RegExp(`^\\|\\s*${ID}\\s*\\|`).test(l.trim()));
  assert.ok(rows.length >= 35, `inventory rows: ${rows.length}`);
  const ids = rows.map(r => r.trim().replace(/^\|/, '').split('|')[0]!.trim());
  assert.equal(new Set(ids).size, ids.length, 'duplicate id in the inventory');
  for (const row of rows) {
    const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    assert.equal(cells.length, 5, `inventory row must have five cells: ${row}`);
    assert.ok(cells.every(c => c.length > 0), `inventory row has an empty cell: ${row}`);
  }
  // Every inventory entry must correspond to a documented screen or state.
  for (const id of ids) assert.ok(defined.has(id), `inventory lists an undefined id: ${id}`);
});

test('WIRE-07 the twenty-two verification scenarios are present', () => {
  const section = DOC.slice(DOC.indexOf('## 8. Проверка сценариев'), DOC.indexOf('## 9. Что решено'));
  const rows = section.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l.trim()));
  assert.equal(rows.length, 22, `expected 22 scenarios, found ${rows.length}`);
  for (let n = 1; n <= 22; n++) {
    assert.ok(rows.some(r => new RegExp(`^\\|\\s*${n}\\s*\\|`).test(r.trim())), `scenario ${n} is missing`);
  }
  for (const row of rows) {
    const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    assert.equal(cells.length, 5, `scenario row must have five cells: ${row}`);
    assert.ok(cells.every(c => c.length > 0), `scenario row has an empty cell: ${row}`);
  }
});

test('WIRE-08 B1, B3, INV-1 and raceDate are respected by design', () => {
  assert.match(DOC, /INV-1/, 'the pending-result rule must be referenced');
  assert.match(DOC, /ui-copy\.md/, 'the copy dictionary must be the source of user-facing text');
  // No screen may compute a classification or a future plan.
  assert.doesNotMatch(DOC, /рассчитывает (GREEN|YELLOW|RED)/i);
  assert.match(DOC, /не прогнозирует|прогноз оценки не показывается|не показывает прогноз/i);
  // B1: the repeats rule is a warning, not a block.
  assert.match(DOC, /Отправка не блокируется|отправка не блокируется/);
  // raceDate is a separate event with its own terminal handling.
  assert.match(DOC, /Итоговый забег — отдельное событие|отдельное событие/);
  assert.match(DOC, /AWAITING_FINAL_RESULT/);
  // Technical codes stay out of the normal interface.
  assert.match(DOC, /технический код не показывается|Технические коды в обычном интерфейсе не показываются/i);
});

test('WIRE-09 accessibility and mobile-first rules are stated', () => {
  for (const rule of [/360–430/, /текстовый/, /не только цветом|только поддержка/, /44 px/, /системную клавиатуру/, /aria-describedby/, /tooltip/i]) {
    assert.match(DOC, rule, `missing accessibility rule: ${rule}`);
  }
});
