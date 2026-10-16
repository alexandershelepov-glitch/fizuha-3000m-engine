/**
 * QA issue #23, DEF-004: "По плану: N отрезков" must decline "отрезок" by the number.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as text from '../web/src/ui/copy/text.ts';

const planned = (n: number): string => text.resultForm.repeats.planned(null, n);

test('DEF-004 «отрезок» agrees with the number in every declension class', () => {
  const expected: Record<number, string> = {
    0: 'отрезков', 1: 'отрезок', 2: 'отрезка', 3: 'отрезка', 4: 'отрезка', 5: 'отрезков', 9: 'отрезков', 10: 'отрезков',
    11: 'отрезков', 12: 'отрезков', 13: 'отрезков', 14: 'отрезков', 15: 'отрезков', 20: 'отрезков', 21: 'отрезок', 22: 'отрезка',
    24: 'отрезка', 25: 'отрезков', 101: 'отрезок', 111: 'отрезков', 112: 'отрезков', 121: 'отрезок',
  };
  for (const [n, word] of Object.entries(expected)) assert.equal(planned(Number(n)), `По плану: ${n} ${word}`);
});

test('DEF-004 a structured plan description is passed through unchanged', () => {
  assert.equal(text.resultForm.repeats.planned('6 × 400 м', 6), 'По плану: 6 × 400 м');
});
