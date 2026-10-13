/**
 * Routing: pure parsing and guarding, kept free of React and of the DOM so that navigation rules can
 * be tested directly. Navigation must survive a reload, therefore the route is the URL.
 */
import {QUESTIONNAIRE_STEPS} from '../application/questionnaire.ts';
import type {QuestionnaireStep} from '../application/questionnaire.ts';

export type Route =
  | {name: 'FIRST_RUN'}
  | {name: 'QUESTIONNAIRE'; step: QuestionnaireStep}
  | {name: 'REVIEW'}
  | {name: 'ASSESSMENT'}
  | {name: 'PLAN_READY'}
  | {name: 'TODAY'}
  | {name: 'PLAN'}
  | {name: 'HISTORY'}
  | {name: 'PROFILE'}
  | {name: 'SAFETY_RECHECK'}
  | {name: 'CONTINUOUS_3K'}
  | {name: 'PARAMETERS'}
  | {name: 'PARAMETERS_OUTCOME'}
  | {name: 'FINAL_RESULT'}
  | {name: 'CYCLE_SUMMARY'; id: string}
  | {name: 'WORKOUT'; id: string}
  | {name: 'WORKOUT_RESULT'; id: string}
  | {name: 'WORKOUT_OUTCOME'; id: string}
  | {name: 'WORKOUT_MOVE'; id: string}
  | {name: 'CHECKPOINT'}
  | {name: 'CHECKPOINT_OUTCOME'}
  | {name: 'NOT_FOUND'};

export const PATH = {
  firstRun: '/',
  questionnaire: '/questionnaire',
  review: '/review',
  assessment: '/assessment',
  planReady: '/plan-ready',
  today: '/today',
  plan: '/plan',
  history: '/history',
  profile: '/profile',
} as const;

const isStep = (value: string | null): value is QuestionnaireStep =>
  value !== null && (QUESTIONNAIRE_STEPS as readonly string[]).includes(value);

export function parseRoute(pathname: string, search = ''): Route {
  const params = new URLSearchParams(search);
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === PATH.firstRun) return {name: 'FIRST_RUN'};
  if (path === PATH.questionnaire) {
    const requested = params.get('step');
    const step = isStep(requested) ? requested : QUESTIONNAIRE_STEPS[0];
    return {name: 'QUESTIONNAIRE', step};
  }
  if (path === PATH.review) return {name: 'REVIEW'};
  if (path === PATH.assessment) return {name: 'ASSESSMENT'};
  if (path === PATH.planReady) return {name: 'PLAN_READY'};
  if (path === PATH.today) return {name: 'TODAY'};
  if (path === PATH.plan) return {name: 'PLAN'};
  if (path === PATH.history) return {name: 'HISTORY'};
  if (path === PATH.profile) return {name: 'PROFILE'};

  if (path === '/profile/continuous-3k') return {name: 'CONTINUOUS_3K'};
  if (path === '/profile/safety') return {name: 'SAFETY_RECHECK'};
  if (path === '/profile/parameters') return {name: 'PARAMETERS'};
  if (path === '/profile/parameters/outcome') return {name: 'PARAMETERS_OUTCOME'};
  if (path === '/final-result') return {name: 'FINAL_RESULT'};
  const summary = /^\/history\/([^/]+)$/.exec(path);
  if (summary) return {name: 'CYCLE_SUMMARY', id: decodeURIComponent(summary[1]!)};

  const result = /^\/workout\/([^/]+)\/result$/.exec(path);
  if (result) return {name: 'WORKOUT_RESULT', id: decodeURIComponent(result[1]!)};

  const outcome = /^\/workout\/([^/]+)\/outcome$/.exec(path);
  if (outcome) return {name: 'WORKOUT_OUTCOME', id: decodeURIComponent(outcome[1]!)};

  const move = /^\/workout\/([^/]+)\/move$/.exec(path);
  if (move) return {name: 'WORKOUT_MOVE', id: decodeURIComponent(move[1]!)};

  if (path === '/checkpoint') return {name: 'CHECKPOINT'};
  if (path === '/checkpoint/outcome') return {name: 'CHECKPOINT_OUTCOME'};

  const workout = /^\/workout\/([^/]+)$/.exec(path);
  if (workout) return {name: 'WORKOUT', id: decodeURIComponent(workout[1]!)};

  return {name: 'NOT_FOUND'};
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'FIRST_RUN': return PATH.firstRun;
    case 'QUESTIONNAIRE': return `${PATH.questionnaire}?step=${route.step}`;
    case 'REVIEW': return PATH.review;
    case 'ASSESSMENT': return PATH.assessment;
    case 'PLAN_READY': return PATH.planReady;
    case 'TODAY': return PATH.today;
    case 'PLAN': return PATH.plan;
    case 'HISTORY': return PATH.history;
    case 'PROFILE': return PATH.profile;
    case 'SAFETY_RECHECK': return '/profile/safety';
    case 'CONTINUOUS_3K': return '/profile/continuous-3k';
    case 'PARAMETERS': return '/profile/parameters';
    case 'PARAMETERS_OUTCOME': return '/profile/parameters/outcome';
    case 'FINAL_RESULT': return '/final-result';
    case 'CYCLE_SUMMARY': return `/history/${encodeURIComponent(route.id)}`;
    case 'WORKOUT': return `/workout/${encodeURIComponent(route.id)}`;
    case 'WORKOUT_RESULT': return `/workout/${encodeURIComponent(route.id)}/result`;
    case 'WORKOUT_OUTCOME': return `/workout/${encodeURIComponent(route.id)}/outcome`;
    case 'WORKOUT_MOVE': return `/workout/${encodeURIComponent(route.id)}/move`;
    case 'CHECKPOINT': return '/checkpoint';
    case 'CHECKPOINT_OUTCOME': return '/checkpoint/outcome';
    case 'NOT_FOUND': return PATH.firstRun;
  }
}

export interface RouteContext {
  /** True when a stored active cycle is available. */
  readonly hasCycle: boolean;
  /** True only in the session that created the cycle, so onboarding screens are not re-entered later. */
  readonly onboardingInProgress: boolean;
}

/**
 * Decide which screen may actually be shown. A direct link to a protected screen without an active
 * cycle lands on the first run; onboarding screens with an existing cycle land on Today; the
 * assessment is shown once, right after the cycle was created.
 */
export function guardRoute(route: Route, context: RouteContext): {route: Route; redirected: boolean} {
  if (route.name === 'HISTORY' || route.name === 'CYCLE_SUMMARY') return {route, redirected: false};
  if (!context.hasCycle) {
    if (route.name === 'NOT_FOUND') return {route, redirected: false};
    if (route.name === 'FIRST_RUN' || route.name === 'QUESTIONNAIRE' || route.name === 'REVIEW') return {route, redirected: false};
    // A direct link to a protected screen without an active cycle is not an error: it lands on the start.
    return {route: {name: 'FIRST_RUN'}, redirected: true};
  }

  if (route.name === 'FIRST_RUN' || route.name === 'QUESTIONNAIRE' || route.name === 'REVIEW') {
    return {route: {name: 'TODAY'}, redirected: true};
  }
  if (route.name === 'NOT_FOUND') return {route, redirected: false};
  if ((route.name === 'ASSESSMENT' || route.name === 'PLAN_READY') && !context.onboardingInProgress) {
    return {route: {name: 'TODAY'}, redirected: true};
  }
  return {route, redirected: false};
}
