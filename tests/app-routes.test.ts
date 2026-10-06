/**
 * Routing rules: the URL is the state, so navigation survives a reload and a direct link to a
 * protected screen lands on a reachable screen instead of an empty one.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardRoute, parseRoute, routeToPath} from '../web/src/app/routes.ts';
import {QUESTIONNAIRE_STEPS} from '../web/src/application/questionnaire.ts';

test('ROUTE-01 every screen has a stable path and parses back', () => {
  const routes = [
    {name: 'FIRST_RUN'}, {name: 'REVIEW'}, {name: 'ASSESSMENT'}, {name: 'PLAN_READY'},
    {name: 'TODAY'}, {name: 'PLAN'}, {name: 'HISTORY'}, {name: 'PROFILE'},
    {name: 'WORKOUT', id: 'w-1'},
    {name: 'QUESTIONNAIRE', step: 'SAFETY'},
  ] as const;
  for (const route of routes) {
    const path = routeToPath(route as never);
    assert.deepEqual(parseRoute(path.split('?')[0]!, path.includes('?') ? `?${path.split('?')[1]}` : ''), route);
  }
  assert.deepEqual(parseRoute('/nope'), {name: 'NOT_FOUND'});
  assert.deepEqual(parseRoute('/workout/w%201'), {name: 'WORKOUT', id: 'w 1'});
});

test('ROUTE-02 an unknown or missing questionnaire step falls back to the first one', () => {
  assert.deepEqual(parseRoute('/questionnaire'), {name: 'QUESTIONNAIRE', step: QUESTIONNAIRE_STEPS[0]});
  assert.deepEqual(parseRoute('/questionnaire', '?step=NOPE'), {name: 'QUESTIONNAIRE', step: QUESTIONNAIRE_STEPS[0]});
  assert.deepEqual(parseRoute('/questionnaire/', '?step=GOAL'), {name: 'QUESTIONNAIRE', step: 'GOAL'});
  assert.deepEqual(parseRoute('/today/'), {name: 'TODAY'});
});

test('ROUTE-03 without an active cycle only the onboarding screens are reachable', () => {
  const context = {hasCycle: false, onboardingInProgress: false};
  assert.deepEqual(guardRoute({name: 'FIRST_RUN'}, context), {route: {name: 'FIRST_RUN'}, redirected: false});
  assert.equal(guardRoute({name: 'QUESTIONNAIRE', step: 'RESULT'}, context).redirected, false);
  assert.equal(guardRoute({name: 'REVIEW'}, context).redirected, false);
  // A direct link to a protected screen is not an error: it lands on the start screen.
  for (const route of [{name: 'TODAY'}, {name: 'PLAN'}, {name: 'HISTORY'}, {name: 'PROFILE'}, {name: 'ASSESSMENT'}, {name: 'PLAN_READY'}, {name: 'WORKOUT', id: 'w1'}] as const) {
    const result = guardRoute(route as never, context);
    assert.deepEqual(result, {route: {name: 'FIRST_RUN'}, redirected: true}, `${route.name} must redirect`);
  }
});

test('ROUTE-04 with an active cycle the onboarding screens are not revisited', () => {
  const context = {hasCycle: true, onboardingInProgress: false};
  for (const route of [{name: 'FIRST_RUN'}, {name: 'QUESTIONNAIRE', step: 'GOAL'}, {name: 'REVIEW'}] as const) {
    assert.deepEqual(guardRoute(route as never, context), {route: {name: 'TODAY'}, redirected: true});
  }
  for (const route of [{name: 'TODAY'}, {name: 'PLAN'}, {name: 'HISTORY'}, {name: 'PROFILE'}, {name: 'WORKOUT', id: 'w1'}] as const) {
    assert.equal(guardRoute(route as never, context).redirected, false, `${route.name} must be reachable`);
  }
  // The assessment is shown once, in the session that created the cycle.
  assert.equal(guardRoute({name: 'ASSESSMENT'}, context).redirected, true);
  assert.equal(guardRoute({name: 'ASSESSMENT'}, {hasCycle: true, onboardingInProgress: true}).redirected, false);
  assert.equal(guardRoute({name: 'PLAN_READY'}, {hasCycle: true, onboardingInProgress: true}).redirected, false);
  // An unknown path keeps its own screen instead of silently changing the subject.
  assert.deepEqual(guardRoute({name: 'NOT_FOUND'}, context), {route: {name: 'NOT_FOUND'}, redirected: false});
});
