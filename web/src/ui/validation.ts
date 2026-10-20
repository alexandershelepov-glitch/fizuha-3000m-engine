/**
 * Presentation of questionnaire validation. The rules themselves live in the application layer
 * (`buildProfile`) and in the engine; this module only decides which field an error belongs to and
 * which Russian message to show.
 */
import {buildProfile} from '../application/questionnaire.ts';
import {STEP_FOR_FIELD} from '../application/questionnaire.ts';
import type {FieldKey, FieldProblem, QuestionnaireDraft, QuestionnaireStep} from '../application/questionnaire.ts';
import {questionnaire} from './copy/text.ts';

const TIME_FIELDS: readonly FieldKey[] = ['resultTime', 'targetTime'];
/** Fields answered by picking an option, not by typing: their EMPTY wording talks about choosing. */
const CHOICE_FIELDS: readonly FieldKey[] = ['canRun3Km', 'performanceMismatch'];

export function problemMessage(problem: FieldProblem): string {
  if (CHOICE_FIELDS.includes(problem.field)) return questionnaire.choiceErrors.EMPTY;
  if (TIME_FIELDS.includes(problem.field)) return questionnaire.timeErrors[problem.kind === 'NOT_A_NUMBER' ? 'FORMAT' : problem.kind];
  if (problem.field === 'raceDate' || problem.field === 'resultDate') {
    return problem.kind === 'EMPTY' ? questionnaire.dateErrors.EMPTY : questionnaire.dateErrors.FORMAT;
  }
  if (problem.field === 'breaks') {
    return problem.kind === 'EMPTY' ? questionnaire.numberErrors.EMPTY : questionnaire.numberErrors.NOT_A_NUMBER;
  }
  return problem.kind === 'EMPTY' ? questionnaire.numberErrors.EMPTY : questionnaire.numberErrors.NOT_A_NUMBER;
}

/** All structural problems of the current draft, as the application layer sees them. */
export function draftProblems(draft: QuestionnaireDraft): readonly FieldProblem[] {
  const result = buildProfile(draft);
  return result.ok ? [] : result.problems;
}

/** Messages for the fields owned by one step. */
export function problemsForStep(draft: QuestionnaireDraft, step: QuestionnaireStep): Partial<Record<FieldKey, string>> {
  const messages: Partial<Record<FieldKey, string>> = {};
  for (const problem of draftProblems(draft)) {
    if (STEP_FOR_FIELD[problem.field] !== step) continue;
    messages[problem.field] ??= problemMessage(problem);
  }
  return messages;
}

/** First step that still has an unsolved structural problem, used before creating the cycle. */
export function firstProblemStep(draft: QuestionnaireDraft): QuestionnaireStep | null {
  const first = draftProblems(draft)[0];
  return first ? STEP_FOR_FIELD[first.field] : null;
}
