import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {buildProfile} from '../application/questionnaire.ts';
import {STEP_FOR_FIELD, STEP_FOR_CODE} from '../application/questionnaire.ts';
import type {QuestionnaireDraft, QuestionnaireStep} from '../application/questionnaire.ts';
import {createCycle} from '../application/cycle.ts';
import {applyEngineState} from '../application/cycle.ts';
import {newCycleId} from '../application/draft.ts';
import {deviceTimestamp} from '../application/format.ts';
import {clearDraft} from '../application/draft.ts';
import {replanTo} from '../application/engineGateway.ts';
import {saveActiveCycle} from '../application/storage.ts';
import {toUiErrorFromUnknown} from '../application/errorContract.ts';
import type {UiError} from '../application/errorContract.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {guardRoute, routeToPath} from './routes.ts';
import type {Route} from './routes.ts';
import {navigate, useRoute} from './useRouter.ts';
import {browserRepository, browserStorage, useCycleStore} from './useCycleStore.ts';
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
import {Notice} from '../ui/components/Layout.tsx';
import {copyForError} from '../ui/copy/errors.ts';
import {common, nav, notFound} from '../ui/copy/text.ts';
import {Button} from '../ui/components/Button.tsx';

const LOCALE = 'ru-RU';

export function App({storage: injected}: {storage?: KeyValueStorage} = {}): ReactNode {
  const storage = useMemo(() => injected ?? browserStorage(), [injected]);
  const repo = useMemo(() => browserRepository(storage), [storage]);
  const store = useCycleStore(repo, storage);
  const route = useRoute();
  const draftStore = useDraft(storage, store.today);
  const [refreshing, setRefreshing] = useState(false);
  const [planError, setPlanError] = useState<UiError | null>(null);
  const [engineError, setEngineError] = useState<{error: UiError; step: QuestionnaireStep} | null>(null);

  const hasCycle = store.load.kind === 'READY';
  const guarded = guardRoute(route, {hasCycle, onboardingInProgress: store.onboardingInProgress});
  const effective = guarded.route;
  const effectivePath = routeToPath(effective);

  // Keep the URL in step with the screen the guard actually allows, so a reload lands correctly.
  useEffect(() => {
    if (!guarded.redirected) return;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== effectivePath) window.history.replaceState(null, '', effectivePath);
  }, [guarded.redirected, effectivePath]);

  const handleCreate = useCallback((draft: QuestionnaireDraft): CreateOutcome => {
    const built = buildProfile(draft);
    if (!built.ok) {
      const first = built.problems[0]!;
      return {kind: 'PROBLEMS', step: {name: 'QUESTIONNAIRE', step: STEP_FOR_FIELD[first.field]}};
    }

    const result = createCycle(repo, {
      profile: built.profile,
      deviceToday: store.today,
      cycleId: newCycleId(),
      createdAt: deviceTimestamp(),
      locale: LOCALE,
    });

    if (!result.ok) {
      const code = result.error.code;
      const step = code === 'UNKNOWN' ? undefined : STEP_FOR_CODE[code];
      if (step) setEngineError({error: result.error, step});
      return {kind: 'ENGINE_ERROR', error: result.error, step: step ? {name: 'QUESTIONNAIRE', step} : null};
    }

    clearDraft(storage);
    store.adopt({appState: result.appState, engineState: result.engineState});
    return {kind: 'CREATED'};
  }, [repo, storage, store]);

  const handleRefreshPlan = useCallback(() => {
    if (store.appState === null || store.engineState === null) return;
    setRefreshing(true);
    setPlanError(null);
    try {
      const next = replanTo(store.engineState, store.today);
      const envelope = applyEngineState(store.appState, next);
      saveActiveCycle(repo, envelope);
      store.adopt({appState: envelope, engineState: next});
    } catch (error) {
      setPlanError(toUiErrorFromUnknown(error));
    } finally {
      setRefreshing(false);
    }
  }, [repo, store]);

  const goTo = useCallback((next: Route) => {
    if (next.name !== 'QUESTIONNAIRE') setEngineError(null);
    navigate(next);
  }, []);

  if (store.load.kind === 'DAMAGED' || store.load.kind === 'UNSUPPORTED_FORMAT' || store.load.kind === 'UNSUPPORTED_ENGINE_STATE' || store.load.kind === 'IMPOSSIBLE_STATE') {
    return (
      <div className="app">
        <main className="app__main">
          <LoadError
            result={store.load}
            onStartOver={() => {
              if (store.load.kind !== 'DAMAGED') return;
              // The damaged record is not deleted automatically; starting over writes a new cycle.
              navigate({name: 'FIRST_RUN'});
            }}
          />
        </main>
      </div>
    );
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
        return <WorkoutDetails workout={workout} onBack={() => goTo({name: 'TODAY'})} />;
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
