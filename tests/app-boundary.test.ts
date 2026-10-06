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
  assert.deepEqual(imported, ['EngineError', 'createEngine', 'deserialize', 'recordResult as engineRecordResult', 'replan', 'serialize', 'taperDays', 'validateProfile']);
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

test('BOUNDARY-05 the frontend never derives a verdict of its own', () => {
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
