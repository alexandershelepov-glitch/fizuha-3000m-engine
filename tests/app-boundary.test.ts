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
  assert.deepEqual(imported, ['EngineError', 'createEngine', 'deserialize', 'replan', 'serialize', 'taperDays', 'validateProfile']);
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
  // No threshold or verdict may be recomputed in the frontend. The gateway is exempt for the public
  // readers it forwards (taperDays), which is delegation, not recomputation.
  for (const file of sources.filter((entry) => entry.path !== 'web/src/application/engineGateway.ts')) {
    for (const pattern of [/===\s*'GREEN'/, /===\s*'YELLOW'/, /===\s*'RED'/, /taperDays\s*\(/, /speedMps\s*[*/+-]/]) {
      assert.equal(pattern.test(file.text), false, `${file.path} must not recompute a sport decision (${pattern})`);
    }
  }
});
