/**
 * The layer boundary of docs/pwa-architecture.md §1, checked mechanically:
 * the engine is reached from exactly one module, the application layer never imports the UI, and the
 * frontend never calls the internal sport functions.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const WEB = 'web/src';

function files(dir: string): string[] {
  return readdirSync(dir, {recursive: true})
    .map((entry) => join(dir, String(entry)))
    .filter((path) => statSync(path).isFile() && /\.(ts|tsx)$/.test(path));
}

const sources = files(WEB).map((path) => ({path: relative('.', path), text: readFileSync(path, 'utf8')}));

test('BOUNDARY-01 only the engine gateway imports the engine', () => {
  const importing = sources.filter((file) => /from '[^']*src\/index\.ts'/.test(file.text)).map((file) => file.path);
  assert.deepEqual(importing, ['web/src/application/engineGateway.ts']);
});

test('BOUNDARY-02 the gateway imports only the public engine API', () => {
  const gateway = sources.find((file) => file.path === 'web/src/application/engineGateway.ts')!;
  const block = /import \{([\s\S]*?)\} from '\.\.\/\.\.\/\.\.\/src\/index\.ts'/.exec(gateway.text);
  assert.ok(block, 'the gateway must import from the package entry point');
  const imported = block[1]!.split(',').map((name) => name.trim()).filter(Boolean).sort();
  assert.deepEqual(imported, ['EngineError', 'PERFORMANCE_SOURCES', 'createEngine', 'deserialize', 'moveWorkout as engineMoveWorkout', 'recordCheckpoint as engineRecordCheckpoint', 'recordFinalResult as engineRecordFinalResult', 'recordResult as engineRecordResult', 'replan', 'resolveDiagnostic as engineResolveDiagnostic', 'serialize', 'skipWorkout as engineSkipWorkout', 'taperDays', 'updateTrainingData as engineUpdateTrainingData', 'validateProfile']);
});

test('BOUNDARY-03 the frontend never calls internal sport functions', () => {
  const forbidden = ['generateQueue', 'prescribe', 'initialDose', 'classify', 'assessSafety', 'assessCapacity', 'assessFeasibility'];
  for (const file of sources) {
    for (const name of forbidden) {
      // Match call sites only: a prose mention in a comment is not a call.
      assert.equal(new RegExp(`\\b${name}\\s*\\(`).test(file.text), false, `${file.path} must not call ${name}`);
    }
  }
});

test('BOUNDARY-04 the application layer never imports the UI', () => {
  for (const file of sources.filter((entry) => entry.path.startsWith('web/src/application/'))) {
    assert.equal(/from '[^']*\/ui\//.test(file.text), false, `${file.path} must not import the UI layer`);
    assert.equal(file.path.endsWith('.tsx'), false, `${file.path} must not be a component`);
  }
});

test('BOUNDARY-05 every sport decision stays in the engine', () => {
  // Comparing a verdict the engine produced, in order to pick a tone or a label, is presentation and
  // stays allowed — the copy layer maps values to text by design. What is forbidden is *producing* a
  // verdict: calling the classifier, reading its internal metrics, or comparing the raw inputs it
  // classifies. The gateway is exempt for the public readers it forwards.
  const forbidden: [RegExp, string][] = [
    [/\bclassify\s*\(/, 'the classifier'],
    [/\bgenerateQueue\s*\(|\bprescribe\s*\(|\binitialDose\s*\(/, 'the internal planner'],
    [/\bassessSafety\s*\(|\bassessCapacity\s*\(|\bassessFeasibility\s*\(/, 'an internal assessment'],
    [/\b(inRangeFraction|speedDropFraction|sessionLoad)\b/, 'an internal metric of the classifier'],
    [/completionFraction\s*[<>]/, 'a comparison of the completion input'],
    [/sessionRpe\s*[<>]/, 'a comparison of the load input'],
    [/taperDays\s*\(/, 'a taper calculation'],
    [/speedMps\s*[*/+-]/, 'pace arithmetic on a prescribed speed'],
  ];
  for (const file of sources.filter((entry) => entry.path !== 'web/src/application/engineGateway.ts')) {
    for (const [pattern, what] of forbidden) {
      assert.equal(pattern.test(file.text), false, `${file.path} must not use ${what}`);
    }
  }
});

test('BOUNDARY-06 the engine clock is advanced only through the guarded operation', () => {
  // `replan` is the only clock-advancing call the application makes, and it may only be reached from
  // the operation that consults INV-1 first: the gateway defines the wrapper, clockOps is its caller.
  const referencing = sources.filter((file) => /\breplanTo\s*\(/.test(file.text)).map((file) => file.path);
  assert.deepEqual(referencing.sort(), ['web/src/application/clockOps.ts', 'web/src/application/engineGateway.ts']);

  const ops = sources.find((file) => file.path === 'web/src/application/clockOps.ts')!;
  assert.ok(ops.text.includes('assertClockAdvanceAllowed'), 'the guard must be consulted');
  assert.ok(
    ops.text.indexOf('assertClockAdvanceAllowed') < ops.text.indexOf('replanTo('),
    'the invariant must be checked before the engine is asked to rebuild the plan',
  );
});

test('BOUNDARY-07 only creating a cycle may open onboarding', () => {
  const production = sources.filter((file) => !/\.test\.tsx?$/.test(file.path));

  // Opening onboarding lives in one place: adopting a cycle that was just created.
  const adopters = production.filter((file) => /\badoptNewCycle\s*\(/.test(file.text)).map((file) => file.path);
  assert.deepEqual(adopters.sort(), ['web/src/app/App.tsx', 'web/src/app/useCycleStore.ts']);

  // Engine-driven updates of the active cycle use the path that leaves onboarding alone.
  const app = production.find((file) => file.path === 'web/src/app/App.tsx')!;
  assert.ok(/\breplaceActiveState\s*\(/.test(app.text), 'the update path must be used');
  assert.ok(
    app.text.indexOf('adoptNewCycle(') < app.text.indexOf('replaceActiveState('),
    'the creation path and the update path must stay distinguishable',
  );

  // Recording a result is an update of the active cycle, never a new cycle.
  assert.equal(
    (app.text.match(/\badoptNewCycle\s*\(/g) ?? []).length,
    1,
    'only the creation handler may adopt a new cycle',
  );
  assert.ok(
    (app.text.match(/\breplaceActiveState\s*\(/g) ?? []).length >= 2,
    'every engine-driven update must use the update path',
  );

  // No generic method remains that would mean both and reopen onboarding by accident.
  for (const file of production) {
    assert.equal(/\badopt\s*\(/.test(file.text), false, `${file.path} must not use a generic adopt`);
  }
});

test('BOUNDARY-08 a result reaches the engine only through the application operation', () => {
  const production = sources.filter((file) => !/\.test\.tsx?$/.test(file.path));

  // The gateway defines the wrapper for the public engine call, and the application operation is its
  // only caller: UI -> submitWorkoutResult -> gateway -> engine.recordResult.
  const referencing = production.filter((file) => /\brecordWorkoutResult\b/.test(file.text)).map((file) => file.path);
  assert.deepEqual(referencing.sort(), ['web/src/application/engineGateway.ts', 'web/src/application/workoutResult.ts']);

  // No screen and no shell code may name the wrapper or the engine call at all.
  for (const file of production.filter((entry) => entry.path.startsWith('web/src/ui/') || entry.path.startsWith('web/src/app/'))) {
    assert.equal(/\brecordWorkoutResult\b/.test(file.text), false, `${file.path} must not reach the recording wrapper`);
    assert.equal(/\brecordResult\b/.test(file.text), false, `${file.path} must not reach the engine call`);
  }

  const app = production.find((file) => file.path === 'web/src/app/App.tsx')!;
  assert.ok(/\bsubmitWorkoutResult\s*\(/.test(app.text), 'the shell must go through the application operation');
});

test('BOUNDARY-09 every engine transition stays behind its application operation', () => {
  const production = sources.filter((file) => !/\.test\.tsx?$/.test(file.path));

  // Each public transition is reachable from exactly one application operation, plus the gateway that
  // defines the wrapper. A screen cannot reach any of them.
  const transitions: [string, string[]][] = [
    ['moveWorkout', ['web/src/application/engineGateway.ts', 'web/src/application/workoutSchedule.ts']],
    ['skipWorkout', ['web/src/application/engineGateway.ts', 'web/src/application/workoutSchedule.ts']],
    ['recordCheckpoint', ['web/src/application/checkpoint.ts', 'web/src/application/engineGateway.ts']],
  ];
  for (const [name, expected] of transitions) {
    const referencing = production.filter((file) => new RegExp(`\\b${name}\\b`).test(file.text)).map((file) => file.path).sort();
    assert.deepEqual(referencing, [...expected].sort(), `${name} must stay behind its operation`);
  }

  for (const file of production.filter((entry) => entry.path.startsWith('web/src/ui/') || entry.path.startsWith('web/src/app/'))) {
    for (const name of ['moveWorkout', 'skipWorkout', 'recordCheckpoint']) {
      assert.equal(new RegExp(`\\b${name}\\b`).test(file.text), false, `${file.path} must not reference ${name}`);
    }
  }

  // A checkpoint replans, so it advances the clock and must be guarded by INV-1 before the engine runs.
  const checkpoint = production.find((file) => file.path === 'web/src/application/checkpoint.ts')!;
  assert.ok(checkpoint.text.includes('assertClockAdvanceAllowed'), 'the checkpoint must consult INV-1');
  assert.ok(
    checkpoint.text.indexOf('assertClockAdvanceAllowed') < checkpoint.text.indexOf('recordCheckpoint('),
    'the invariant must be checked before the engine is asked to record',
  );

  // Persistence is centralised: only the storage module, the cycle service and the two operations that
  // own a transition write the envelope, and each of them writes it before returning.
  const writers = production.filter((file) => /saveActiveCycle\s*\(/.test(file.text)).map((file) => file.path).sort();
  assert.deepEqual(writers, [
    'web/src/application/clockOps.ts',
    'web/src/application/cycle.ts',
    'web/src/application/storage.ts',
    'web/src/application/transition.ts',
  ]);
});

test('BOUNDARY-10 a skip cause is derived by the application, never supplied', () => {
  const production = sources.filter((file) => !/\.test\.tsx?$/.test(file.path));

  // No module may state a cause as an argument: the only place a concrete cause is produced is the
  // operation itself, from the session's own date.
  for (const file of production) {
    const stated = /cause\s*:\s*'(VOLUNTARY|PAST_DUE)'\s*[,}]/.test(file.text);
    assert.equal(stated && file.path !== 'web/src/application/workoutSchedule.ts', false, `${file.path} must not state a skip cause`);
  }

  const ops = production.find((file) => file.path === 'web/src/application/workoutSchedule.ts')!;
  assert.ok(/isOverdue\s*\(/.test(ops.text), 'the reason must come from the application overdue rule');
  assert.ok(/'PAST_DUE'/.test(ops.text) && /'VOLUNTARY'/.test(ops.text));
  // And that rule compares the session's own date with the device date, in one place.
  const invariants = production.find((file) => file.path === 'web/src/application/invariants.ts')!;
  assert.ok(/scheduledDate\s*<\s*today/.test(invariants.text), 'the overdue rule must compare the session date');

  // The operation's request has no cause field, so a screen cannot pass one.
  assert.equal(/readonly cause/.test(ops.text), false, 'the caller must not be able to state a reason');
});

test('BOUNDARY-11 an overdue session can never be moved', () => {
  const invariants = sources.find((file) => file.path === 'web/src/application/invariants.ts')!;
  // The rule is part of the application decision, before the order rule, and it is a real refusal.
  assert.ok(/action === 'MOVE' && isOverdue\(workout, today\)/.test(invariants.text), 'the past-due move rule must exist');
  assert.ok(invariants.text.includes("'PAST_DUE_CANNOT_MOVE'"), 'the availability must name the refusal');
  assert.ok(invariants.text.includes("'PAST_DUE_WORKOUT_CANNOT_MOVE'"), 'the guard must raise the application code');

  // The screens consult that decision instead of comparing dates themselves.
  for (const file of sources.filter((entry) => entry.path.startsWith('web/src/ui/'))) {
    assert.equal(/scheduledDate\s*[<>]\s*today/.test(file.text), false, `${file.path} must not decide availability itself`);
  }
});

test('BOUNDARY-12 parameter updates only reach the engine through their guarded operation', () => {
  const production = sources.filter(f => !/\.test\.tsx?$/.test(f.path));
  assert.deepEqual(production.filter(f => /\bupdateTrainingData\b/.test(f.text)).map(f => f.path).sort(), ['web/src/application/engineGateway.ts', 'web/src/application/parameters.ts']);
  const operation = production.find(f => f.path.endsWith('/parameters.ts'))!;
  assert.ok(operation.text.indexOf('assertClockAdvanceAllowed') < operation.text.indexOf('updateTrainingData('));
});
test('BOUNDARY-13 final recording only reaches the engine through the terminal operation', () => {
  const production = sources.filter(f => !/\.test\.tsx?$/.test(f.path));
  assert.deepEqual(production.filter(f => /\brecordFinalResult\b/.test(f.text)).map(f => f.path).sort(), ['web/src/application/engineGateway.ts', 'web/src/application/finalResult.ts']);
});
test('BOUNDARY-14 archive storage preserves opaque state and does not import engine internals', () => {
  const archive = sources.find(f => f.path.endsWith('/archiveStorage.ts'))!;
  assert.doesNotMatch(archive.text, /src\/index|src\/engine|deserialize|\.engineState\s*=/);
  assert.ok(archive.text.includes('appState: structuredClone(appState)'));
});
test('BOUNDARY-15 terminal result has no ordinary clock guard', () => {
  const operation = sources.find(f => f.path.endsWith('/finalResult.ts'))!;
  assert.doesNotMatch(operation.text, /assertClockAdvanceAllowed/);
});
