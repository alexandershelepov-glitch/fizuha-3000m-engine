import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {buildProfile} from '../application/questionnaire.ts';
import {STEP_FOR_FIELD, STEP_FOR_CODE} from '../application/questionnaire.ts';
import type {QuestionnaireDraft, QuestionnaireStep} from '../application/questionnaire.ts';
import {createCycle} from '../application/cycle.ts';
import {refreshPlan} from '../application/clockOps.ts';
import {submitWorkoutResult} from '../application/workoutResult.ts';
import {nextWorkout} from '../application/planDiff.ts';
import type {PlanChange} from '../application/planDiff.ts';
import {clearResultDraft} from '../application/draft.ts';
import type {WorkoutResult} from '../application/engineGateway.ts';
import {newCycleId} from '../application/draft.ts';
import {deviceTimestamp} from '../application/format.ts';
import {clearDraft} from '../application/draft.ts';
import {createRepository} from '../application/storage.ts';
import {isEngineErrorCode} from '../application/errorContract.ts';
import type {UiError} from '../application/errorContract.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {guardRoute, routeToPath} from './routes.ts';
import type {Route} from './routes.ts';
import {navigate, useRoute} from './useRouter.ts';
import {useCycleStore, useStorageProbe} from './useCycleStore.ts';
import {useDraft} from './useDraft.ts';
import {FirstRun} from '../ui/screens/FirstRun.tsx';
import {Questionnaire} from '../ui/screens/Questionnaire.tsx';
import {Review} from '../ui/screens/Review.tsx';
import type {CreateOutcome} from '../ui/screens/Review.tsx';
import {Assessment} from '../ui/screens/Assessment.tsx';
import {PlanReady} from '../ui/screens/PlanReady.tsx';
import {Today} from '../ui/screens/Today.tsx';
import {Plan} from '../ui/screens/Plan.tsx';
import {History} from '../ui/screens/History.tsx';
import {Profile} from '../ui/screens/Profile.tsx';
import {WorkoutDetails} from '../ui/screens/WorkoutDetails.tsx';
import {LoadError} from '../ui/screens/LoadError.tsx';
import {StorageUnavailable} from '../ui/screens/StorageUnavailable.tsx';
import {ResultForm} from '../ui/screens/ResultForm.tsx';
import type {SubmitOutcome} from '../ui/screens/ResultForm.tsx';
import {OutcomeMissing, ResultOutcome} from '../ui/screens/ResultOutcome.tsx';
import {ClosedWorkout} from '../ui/screens/ClosedWorkout.tsx';
import {Notice} from '../ui/components/Layout.tsx';
import {copyForError} from '../ui/copy/errors.ts';
import {common, nav, notFound} from '../ui/copy/text.ts';
import {Button} from '../ui/components/Button.tsx';

const LOCALE = 'ru-RU';

export function App({storage: injected}: {storage?: KeyValueStorage} = {}): ReactNode {
  const {probe, retry: retryStorage} = useStorageProbe(injected);
  const storage = probe.kind === 'AVAILABLE' ? probe.storage : null;
  const repo = useMemo(() => (storage === null ? null : createRepository(storage)), [storage]);
  const store = useCycleStore(repo);
  const route = useRoute();
  const draftStore = useDraft(storage, store.today);
  const [refreshing, setRefreshing] = useState(false);
  const [planError, setPlanError] = useState<UiError | null>(null);
  const [engineError, setEngineError] = useState<{error: UiError; step: QuestionnaireStep} | null>(null);
  /**
   * Observable changes of the last recorded result. They live in the session only: after a reload the
   * outcome screen still shows the engine's verdict, its reason and the new plan, because all of that
   * is derived from the stored state; only this list is gone, and it is then omitted rather than
   * reconstructed.
   */
  const [outcome, setOutcome] = useState<{workoutId: string; changes: readonly PlanChange[]} | null>(null);

  const hasCycle = store.load.kind === 'READY';
  const guarded = guardRoute(route, {hasCycle, onboardingInProgress: store.onboardingInProgress});
  const effective = guarded.route;
  const effectivePath = routeToPath(effective);

  // Keep the URL in step with the screen the guard actually allows, so a reload lands correctly.
  // `route` is part of the dependencies because a navigation to a protected URL may resolve to the
  // same effective path as before; without it the address bar would keep a URL the user cannot reach.
  useEffect(() => {
    if (!guarded.redirected) return;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== effectivePath) window.history.replaceState(null, '', effectivePath);
  }, [guarded.redirected, effectivePath, route]);

  const handleCreate = useCallback((draft: QuestionnaireDraft): CreateOutcome => {
    const built = buildProfile(draft);
    if (!built.ok) {
      const first = built.problems[0]!;
      return {kind: 'PROBLEMS', step: {name: 'QUESTIONNAIRE', step: STEP_FOR_FIELD[first.field]}};
    }

    if (repo === null) return {kind: 'ENGINE_ERROR', error: {code: 'STORAGE_UNAVAILABLE', params: {}, retry: true, fromEngine: false}, step: null};

    const result = createCycle(repo, {
      profile: built.profile,
      deviceToday: store.today,
      cycleId: newCycleId(),
      createdAt: deviceTimestamp(),
      locale: LOCALE,
    });

    if (!result.ok) {
      const code = result.error.code;
      const step = isEngineErrorCode(code) ? STEP_FOR_CODE[code] : undefined;
      if (step) setEngineError({error: result.error, step});
      return {kind: 'ENGINE_ERROR', error: result.error, step: step ? {name: 'QUESTIONNAIRE', step} : null};
    }

    clearDraft(storage);
    store.adoptNewCycle({appState: result.appState, engineState: result.engineState});
    return {kind: 'CREATED'};
  }, [repo, storage, store]);

  const handleRefreshPlan = useCallback(() => {
    if (repo === null || store.appState === null || store.engineState === null) return;
    setRefreshing(true);
    setPlanError(null);
    // INV-1 is enforced inside the operation, not here: the UI cannot bypass it by calling directly.
    const result = refreshPlan({repo, appState: store.appState, engineState: store.engineState, deviceToday: store.today});
    if (result.ok) store.replaceActiveState({appState: result.appState, engineState: result.engineState});
    else setPlanError(result.error);
    setRefreshing(false);
  }, [repo, store]);

  const handleSubmitResult = useCallback((workoutId: string, result: WorkoutResult): SubmitOutcome => {
    if (repo === null || store.appState === null || store.engineState === null) {
      return {ok: false, error: {code: 'STORAGE_UNAVAILABLE'}};
    }
    const recorded = submitWorkoutResult({
      repo,
      appState: store.appState,
      engineState: store.engineState,
      workoutId,
      result,
      deviceToday: store.today,
    });
    if (!recorded.ok) return {ok: false, error: {code: recorded.error.code, params: recorded.error.params}};

    store.replaceActiveState({appState: recorded.done.appState, engineState: recorded.done.engineState});
    clearResultDraft(storage);
    setOutcome({workoutId, changes: recorded.done.changes});
    navigate({name: 'WORKOUT_OUTCOME', id: workoutId});
    return {ok: true};
  }, [repo, storage, store]);

  const goTo = useCallback((next: Route) => {
    if (next.name !== 'QUESTIONNAIRE') setEngineError(null);
    navigate(next);
  }, []);

  if (store.load.kind === 'NO_STORAGE') return <StorageUnavailable onRetry={retryStorage} />;

  if (store.load.kind === 'DAMAGED' || store.load.kind === 'UNSUPPORTED_FORMAT' || store.load.kind === 'UNSUPPORTED_ENGINE_STATE' || store.load.kind === 'IMPOSSIBLE_STATE') {
    // The damaged record is removed only after the confirmation inside LoadError.
    return <LoadError result={store.load} onDiscard={() => store.discardDamagedCycle()} />;
  }

  return (
    <div className="app">
      {planError ? (
        <div className="app__banner">
          <Notice tone="danger" title={copyForError(planError).title}>
            <p>{copyForError(planError).text(planError.params)}</p>
            <Button variant="ghost" onClick={() => setPlanError(null)}>{common.understood}</Button>
          </Notice>
        </div>
      ) : null}

      <main className="app__main">
        {renderScreen()}
      </main>

      {store.load.kind === 'READY' ? <BottomNav active={effective} onNavigate={goTo} /> : null}
    </div>
  );

  function renderScreen(): ReactNode {
    switch (effective.name) {
      case 'FIRST_RUN':
        return <FirstRun onStart={() => goTo({name: 'QUESTIONNAIRE', step: 'RESULT'})} />;
      case 'QUESTIONNAIRE':
        return (
          <Questionnaire
            key={effective.step}
            step={effective.step}
            store={draftStore}
            onNavigate={goTo}
            engineError={engineError !== null && engineError.step === effective.step ? engineError.error : null}
            onDismissEngineError={() => setEngineError(null)}
          />
        );
      case 'REVIEW':
        return <Review draft={draftStore.draft} today={store.today} onCreate={handleCreate} onNavigate={goTo} />;
      case 'ASSESSMENT':
        return store.engineState === null ? null : (
          <Assessment decision={store.engineState.decision} profile={store.engineState.profile} onContinue={() => goTo({name: 'PLAN_READY'})} />
        );
      case 'PLAN_READY':
        return store.engineState === null ? null : (
          <PlanReady
            engineState={store.engineState}
            onContinue={() => {
              store.finishOnboarding();
              goTo({name: 'TODAY'});
            }}
          />
        );
      case 'TODAY':
        return store.engineState === null ? null : (
          <Today engineState={store.engineState} today={store.today} onNavigate={goTo} onRefreshPlan={handleRefreshPlan} refreshing={refreshing} />
        );
      case 'PLAN':
        return store.engineState === null ? null : (
          <Plan engineState={store.engineState} today={store.today} onNavigate={goTo} onRefreshPlan={handleRefreshPlan} refreshing={refreshing} />
        );
      case 'HISTORY':
        return store.appState === null ? null : <History appState={store.appState} onNavigate={goTo} />;
      case 'PROFILE':
        return store.appState === null || store.engineState === null ? null : <Profile appState={store.appState} engineState={store.engineState} />;
      case 'WORKOUT': {
        const workout = store.engineState?.queue.find((entry) => entry.id === effective.id) ?? null;
        return (
          <WorkoutDetails
            workout={workout}
            onBack={() => goTo({name: 'TODAY'})}
            onEnterResult={() => goTo({name: 'WORKOUT_RESULT', id: effective.id})}
          />
        );
      }
      case 'WORKOUT_RESULT': {
        const workout = store.engineState?.queue.find((entry) => entry.id === effective.id) ?? null;
        if (workout !== null) {
          return (
            <ResultForm
              workout={workout}
              storage={storage}
              submit={(result) => handleSubmitResult(workout.id, result)}
              onCancel={() => goTo({name: 'WORKOUT', id: effective.id})}
            />
          );
        }
        // Not in the queue: either it was already recorded, or the plan moved on.
        const closed = store.engineState?.history.some((entry) => entry.workout.id === effective.id) ?? false;
        return closed
          ? <ClosedWorkout onOpenPlan={() => goTo({name: 'PLAN'})} onBackToToday={() => goTo({name: 'TODAY'})} />
          : <OutcomeMissing onOpenPlan={() => goTo({name: 'PLAN'})} />;
      }
      case 'WORKOUT_OUTCOME': {
        if (store.engineState === null) return null;
        const entry = store.engineState.history.find((item) => item.workout.id === effective.id) ?? null;
        if (entry === null) return <OutcomeMissing onOpenPlan={() => goTo({name: 'PLAN'})} />;
        return (
          <ResultOutcome
            entry={entry}
            engineState={store.engineState}
            today={store.today}
            nextWorkout={nextWorkout(store.engineState, store.today)}
            changes={outcome !== null && outcome.workoutId === effective.id ? outcome.changes : null}
            onContinue={() => goTo({name: 'TODAY'})}
            onOpenPlan={() => goTo({name: 'PLAN'})}
          />
        );
      }
      case 'NOT_FOUND':
        return (
          <div className="screen screen--centered">
            <Notice tone="info" title={notFound.title}>
              <p>{notFound.text}</p>
            </Notice>
            <div className="actions">
              <Button onClick={() => goTo(hasCycle ? {name: 'TODAY'} : {name: 'FIRST_RUN'})}>{hasCycle ? nav.today : notFound.cta}</Button>
            </div>
          </div>
        );
    }
  }
}

function BottomNav({active, onNavigate}: {active: Route; onNavigate: (route: Route) => void}): ReactNode {
  const items: readonly {route: Route; label: string; match: Route['name'][]}[] = [
    {route: {name: 'TODAY'}, label: nav.today, match: ['TODAY', 'WORKOUT']},
    {route: {name: 'PLAN'}, label: nav.plan, match: ['PLAN']},
    {route: {name: 'HISTORY'}, label: nav.history, match: ['HISTORY']},
    {route: {name: 'PROFILE'}, label: nav.profile, match: ['PROFILE']},
  ];
  return (
    <nav className="bottom-nav" aria-label="Основные разделы">
      {items.map((item) => {
        const current = item.match.includes(active.name);
        return (
          <button
            key={item.label}
            type="button"
            className={`bottom-nav__item${current ? ' bottom-nav__item--active' : ''}`}
            aria-current={current ? 'page' : undefined}
            onClick={() => onNavigate(item.route)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
