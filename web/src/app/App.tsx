import {archiveCompletedCycle, loadArchives} from '../application/archive.ts';
import {createArchiveRepository} from '../application/archiveStorage.ts';
import {submitFinalResult} from '../application/finalResult.ts';
import {updateGoalAndRaceDate} from '../application/parameters.ts';
import type {PerformanceSource} from '../application/engineGateway.ts';
import {ParametersForm} from '../ui/screens/ParametersForm.tsx';
import {ParametersOutcome} from '../ui/screens/ParametersOutcome.tsx';
import {FinalResultForm} from '../ui/screens/FinalResultForm.tsx';
import {CycleSummary} from '../ui/screens/CycleSummary.tsx';
import {ArchiveList} from '../ui/screens/ArchiveList.tsx';
import {lifecycle} from '../ui/copy/text.ts';
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {buildProfile} from '../application/questionnaire.ts';
import {STEP_FOR_FIELD, STEP_FOR_CODE} from '../application/questionnaire.ts';
import type {QuestionnaireDraft, QuestionnaireStep} from '../application/questionnaire.ts';
import {createCycle} from '../application/cycle.ts';
import {refreshPlan} from '../application/clockOps.ts';
import {submitWorkoutResult} from '../application/workoutResult.ts';
import {moveScheduledWorkout, skipScheduledWorkout} from '../application/workoutSchedule.ts';
import {actionAvailability} from '../application/invariants.ts';
import {submitCheckpoint} from '../application/checkpoint.ts';
import type {PerformanceSnapshot} from '../application/engineGateway.ts';
import {nextWorkout} from '../application/planDiff.ts';
import type {PlanChange} from '../application/planDiff.ts';
import {clearResultDraft} from '../application/draft.ts';
import type {WorkoutResult} from '../application/engineGateway.ts';
import {newCycleId} from '../application/draft.ts';
import {deviceTimestamp} from '../application/format.ts';
import {clearDraft} from '../application/draft.ts';
import {createRepository} from '../application/storage.ts';
import {resetActiveCycle} from '../application/resetCycle.ts';
import {recheckSafety} from '../application/safetyRecheck.ts';
import {SafetyRecheck} from '../ui/screens/SafetyRecheck.tsx';
import type {SafetyData} from '../application/engineGateway.ts';
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
import {MoveWorkout} from '../ui/screens/MoveWorkout.tsx';
import {MoveNotAllowed} from '../ui/screens/MoveNotAllowed.tsx';
import type {MoveSubmitOutcome} from '../ui/screens/MoveWorkout.tsx';
import {CheckpointForm} from '../ui/screens/CheckpointForm.tsx';
import type {CheckpointSubmitOutcome} from '../ui/screens/CheckpointForm.tsx';
import {CheckpointOutcome} from '../ui/screens/CheckpointOutcome.tsx';
import type {SkipOutcome} from '../ui/screens/WorkoutDetails.tsx';
import {ResultTooEarly} from '../ui/screens/ResultTooEarly.tsx';
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
  const archiveRepo = useMemo(() => storage ? createArchiveRepository(storage) : null, [storage]);
  const [archiveRevision, setArchiveRevision] = useState(0);
  const archives = useMemo(() => archiveRepo ? loadArchives(archiveRepo) : null, [archiveRepo, archiveRevision]);
  const [archiveError, setArchiveError] = useState<UiError | null>(null);
  const [parameterChanges, setParameterChanges] = useState<readonly PlanChange[] | null>(null);
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
  /** Changes of the last checkpoint, kept for the session that recorded it. */
  const [checkpointChanges, setCheckpointChanges] = useState<readonly PlanChange[] | null>(null);
  /** True while an engine transition is being applied, so a second tap cannot start another one. */
  const [busy, setBusy] = useState(false);

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
    if (repo === null || store.appState === null || store.engineState === null || store.engineState.finalResultRecorded) return;
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

  const handleSkip = useCallback((workoutId: string): SkipOutcome => {
    if (repo === null || store.appState === null || store.engineState === null) return {ok: false, error: {code: 'STORAGE_UNAVAILABLE'}};
    setBusy(true);
    // The reason is derived inside the operation from the session's date; the shell cannot state it.
    const outcome = skipScheduledWorkout({
      repo, appState: store.appState, engineState: store.engineState,
      workoutId, deviceToday: store.today, at: deviceTimestamp(),
    });
    setBusy(false);
    if (!outcome.ok) return {ok: false, error: {code: outcome.error.code, params: outcome.error.params}};
    store.replaceActiveState({appState: outcome.done.appState, engineState: outcome.done.engineState});
    return {ok: true};
  }, [repo, store]);

  const handleMove = useCallback((workoutId: string, toDate: string): MoveSubmitOutcome => {
    if (repo === null || store.appState === null || store.engineState === null) return {ok: false, error: {code: 'STORAGE_UNAVAILABLE'}};
    setBusy(true);
    const outcome = moveScheduledWorkout({
      repo, appState: store.appState, engineState: store.engineState,
      workoutId, toDate, deviceToday: store.today, at: deviceTimestamp(),
    });
    setBusy(false);
    if (!outcome.ok) return {ok: false, error: {code: outcome.error.code, params: outcome.error.params}};
    store.replaceActiveState({appState: outcome.done.appState, engineState: outcome.done.engineState});
    // The session keeps its identity, so its details now show the new date.
    navigate({name: 'WORKOUT', id: workoutId});
    return {ok: true};
  }, [repo, store]);

  const handleCheckpoint = useCallback((performance: PerformanceSnapshot): CheckpointSubmitOutcome => {
    if (repo === null || store.appState === null || store.engineState === null) return {ok: false, error: {code: 'STORAGE_UNAVAILABLE'}};
    setBusy(true);
    const outcome = submitCheckpoint({
      repo, appState: store.appState, engineState: store.engineState,
      performance, deviceToday: store.today, at: deviceTimestamp(),
    });
    setBusy(false);
    if (!outcome.ok) return {ok: false, error: {code: outcome.error.code, params: outcome.error.params}};
    store.replaceActiveState({appState: outcome.done.appState, engineState: outcome.done.engineState});
    setCheckpointChanges(outcome.done.changes);
    navigate({name: 'CHECKPOINT_OUTCOME'});
    return {ok: true};
  }, [repo, store]);

  const handleParameters = (targetTimeSeconds: number, raceDate: string) => {
    if (!repo || !store.appState || !store.engineState) return {ok: false, error: {code: 'STORAGE_UNAVAILABLE', params: {}, retry: true, fromEngine: false} as UiError};
    const result = updateGoalAndRaceDate({repo, appState: store.appState, engineState: store.engineState, targetTimeSeconds, raceDate, deviceToday: store.today, at: deviceTimestamp()});
    if (result.ok) {
      store.replaceActiveState(result.done); setParameterChanges(result.done.changes);
      navigate(result.done.appState === store.appState ? {name: 'PROFILE'} : {name: 'PARAMETERS_OUTCOME'});
    }
    return result;
  };

  const handleArchive = (appState = store.appState) => {
    if (!repo || !archiveRepo || !appState) return;
    const result = archiveCompletedCycle({repo, archives: archiveRepo, appState, at: deviceTimestamp()});
    setArchiveRevision(value => value + 1);
    if (result.ok) { setArchiveError(null); store.reload(); }
    else setArchiveError(result.error);
    navigate({name: 'CYCLE_SUMMARY', id: appState.cycle.cycleId});
  };

  const handleFinal = (timeSeconds: number, source: PerformanceSource) => {
    if (!repo || !store.appState || !store.engineState) return {ok: false, error: {code: 'STORAGE_UNAVAILABLE', params: {}, retry: true, fromEngine: false} as UiError};
    const result = submitFinalResult({repo, appState: store.appState, engineState: store.engineState, timeSeconds, source, deviceToday: store.today, at: deviceTimestamp()});
    if (result.ok) {
      // The completed envelope is already durable; archive failure must not turn this into a failed result.
      store.replaceActiveState(result.done); handleArchive(result.done.appState);
    }
    return result;
  };

  const handleSafetyRecheck = (safety: SafetyData, confirmed: boolean) => {
    if (!repo || !store.appState || !store.engineState) {
      return {ok: false as const, error: {code: 'STORAGE_UNAVAILABLE' as const, params: {}, retry: true, fromEngine: false}};
    }
    const outcome = recheckSafety({
      repo, appState: store.appState, engineState: store.engineState,
      safety, medicalReviewConfirmed: confirmed, deviceToday: store.today, at: deviceTimestamp(),
    });
    if (outcome.ok) store.replaceActiveState(outcome.done);
    return outcome.ok
      ? {ok: true as const, stillHold: outcome.done.engineState.decision.safety !== 'OK' || outcome.done.engineState.decision.phase === 'HOLD_DIAGNOSTIC'}
      : {ok: false as const, error: outcome.error};
  };

  const handleResetCycle = () => {
    if (!repo || !storage || !store.appState || !store.engineState) {
      return {ok: false as const, error: {code: 'STORAGE_UNAVAILABLE' as const, params: {}, retry: true, fromEngine: false}};
    }
    const result = resetActiveCycle({repo, storage, appState: store.appState, engineState: store.engineState});
    if (result.ok) {
      // The questionnaire draft also lives in React state: forget it immediately, not just on disk.
      draftStore.reset(store.today);
      setOutcome(null);
      setCheckpointChanges(null);
      setParameterChanges(null);
      setPlanError(null);
      setArchiveError(null);
      store.reload();
      navigate({name: 'FIRST_RUN'});
    }
    return result;
  };

  const goTo = useCallback((next: Route) => {
    if (next.name !== 'QUESTIONNAIRE') setEngineError(null);
    if (next.name === 'CYCLE_SUMMARY' && next.id === '' && store.appState) navigate({...next, id: store.appState.cycle.cycleId});
    else navigate(next);
  }, [store.appState]);

  if (store.load.kind === 'NO_STORAGE') return <StorageUnavailable onRetry={retryStorage} />;
  if (store.load.kind === 'STORAGE_UNAVAILABLE') return <StorageUnavailable onRetry={store.reload} />;

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

  function renderArchives(): ReactNode {
    return <ArchiveList cycles={archives?.ok ? archives.cycles : []} error={archives && !archives.ok ? archives.error : null} onOpen={id => goTo({name: 'CYCLE_SUMMARY', id})} onRetry={() => setArchiveRevision(v => v + 1)} />;
  }
  function renderSummary(id: string): ReactNode {
    const active = store.appState?.cycle.cycleId === id && store.engineState?.finalResultRecorded === true;
    const appState = active ? store.appState : archives?.ok ? archives.cycles.find(c => c.cycleId === id)?.appState : null;
    if (!appState) return <div className="screen"><h1>{lifecycle.missing}</h1>{archives && !archives.ok ? renderArchives() : <p>{lifecycle.missingText}</p>}<Button onClick={() => goTo({name: 'HISTORY'})}>{lifecycle.history}</Button></div>;
    return <CycleSummary appState={appState} active={active} canStartNew={!hasCycle} error={active ? archiveError : null} onArchive={() => handleArchive(appState)} onNew={() => { clearDraft(storage); goTo({name: 'FIRST_RUN'}); }} onHistory={() => goTo({name: 'HISTORY'})} />;
  }

  function renderScreen(): ReactNode {
    switch (effective.name) {
      case 'FIRST_RUN':
        return <FirstRun onStart={() => goTo({name: 'QUESTIONNAIRE', step: 'RESULT'})} onHistory={archives && (!archives.ok || archives.cycles.length) ? () => goTo({name: 'HISTORY'}) : undefined} />;
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
            onRecheck={() => {store.finishOnboarding(); goTo({name: 'SAFETY_RECHECK'});}}
            engineState={store.engineState}
            onContinue={() => {
              store.finishOnboarding();
              goTo({name: 'TODAY'});
            }}
          />
        );
      case 'TODAY':
        return store.engineState === null ? null : (
          <Today
            engineState={store.engineState}
            today={store.today}
            onNavigate={goTo}
            onRefreshPlan={handleRefreshPlan}
            refreshing={refreshing}
            busy={busy}
            onSkipPending={(workoutId) => handleSkip(workoutId)}
          />
        );
      case 'PLAN':
        if (store.engineState?.finalResultRecorded) return renderSummary(store.appState!.cycle.cycleId);
        return store.engineState === null ? null : (
          <Plan engineState={store.engineState} today={store.today} onNavigate={goTo} onRefreshPlan={handleRefreshPlan} refreshing={refreshing} />
        );
      case 'SAFETY_RECHECK':
        if (!store.engineState) return null;
        if (store.engineState.finalResultRecorded) return renderSummary(store.appState!.cycle.cycleId);
        return <SafetyRecheck
          key={store.appState!.cycle.cycleId}
          initial={store.engineState.profile.safety}
          submit={handleSafetyRecheck}
          onCancel={() => goTo({name: 'TODAY'})}
        />;
      case 'PARAMETERS':
        if (!store.engineState) return null;
        if (store.engineState.finalResultRecorded) return renderSummary(store.appState!.cycle.cycleId);
        return <ParametersForm key={store.appState!.cycle.cycleId} engineState={store.engineState} submit={handleParameters} onCancel={() => goTo({name: 'PROFILE'})} />;
      case 'PARAMETERS_OUTCOME':
        return store.appState ? <ParametersOutcome appState={store.appState} changes={parameterChanges} onContinue={() => goTo({name: 'PLAN'})} /> : null;
      case 'FINAL_RESULT':
        if (!store.engineState) return null;
        if (store.engineState.finalResultRecorded) return renderSummary(store.appState!.cycle.cycleId);
        return <FinalResultForm raceDate={store.engineState.profile.raceDate} submit={handleFinal} onCancel={() => goTo({name: 'TODAY'})} />;
      case 'CYCLE_SUMMARY':
        return renderSummary(effective.id);
      case 'HISTORY':
        return store.appState === null || store.engineState === null ? <div className="screen"><h1>{lifecycle.archives}</h1>{renderArchives()}<Button onClick={() => goTo({name: 'FIRST_RUN'})}>{lifecycle.newCycle}</Button></div> : (
          <History appState={store.appState} engineState={store.engineState} onNavigate={goTo} archiveContent={renderArchives()} />
        );
      case 'PROFILE':
        return store.appState === null || store.engineState === null ? null : <Profile appState={store.appState} engineState={store.engineState} onEdit={() => goTo({name: 'PARAMETERS'})} onRecheck={() => goTo({name: 'SAFETY_RECHECK'})} onReset={handleResetCycle} />;
      case 'WORKOUT': {
        const workout = store.engineState?.queue.find((entry) => entry.id === effective.id) ?? null;
        // The application rule decides what the screen may offer; the screen only mirrors it.
        const availability = store.engineState === null ? null : {
          result: actionAvailability(store.engineState, effective.id, store.today, 'RESULT'),
          move: actionAvailability(store.engineState, effective.id, store.today, 'MOVE'),
        };
        return (
          <WorkoutDetails
            workout={workout}
            resultAvailability={availability?.result ?? 'AVAILABLE'}
            moveAvailability={availability?.move ?? 'AVAILABLE'}
            onBack={() => goTo({name: 'TODAY'})}
            onEnterResult={() => goTo({name: 'WORKOUT_RESULT', id: effective.id})}
            onMove={() => goTo({name: 'WORKOUT_MOVE', id: effective.id})}
            skip={() => {
              const result = handleSkip(effective.id);
              if (result.ok) goTo({name: 'TODAY'});
              return result;
            }}
          />
        );
      }
      case 'WORKOUT_MOVE': {
        const workout = store.engineState?.queue.find((entry) => entry.id === effective.id) ?? null;
        if (workout === null || store.engineState === null) {
          return <OutcomeMissing onOpenPlan={() => goTo({name: 'PLAN'})} />;
        }
        // A direct link cannot bypass the rule either: the same application decision is consulted here.
        const moveAvailability = actionAvailability(store.engineState, effective.id, store.today, 'MOVE');
        if (moveAvailability !== 'AVAILABLE') {
          return (
            <MoveNotAllowed
              reason={moveAvailability}
              onBack={() => goTo({name: 'WORKOUT', id: effective.id})}
            />
          );
        }
        return (
          <MoveWorkout
            workout={workout}
            engineState={store.engineState}
            deviceToday={store.today}
            submit={(toDate) => handleMove(workout.id, toDate)}
            onCancel={() => goTo({name: 'WORKOUT', id: effective.id})}
          />
        );
      }
      case 'CHECKPOINT':
        if (store.engineState?.finalResultRecorded) return renderSummary(store.appState!.cycle.cycleId);
        return store.engineState === null ? null : (
          <CheckpointForm
            deviceToday={store.today}
            earliestDate={store.engineState.lastAssessmentDate}
            submit={handleCheckpoint}
            onCancel={() => goTo({name: 'TODAY'})}
          />
        );
      case 'CHECKPOINT_OUTCOME':
        return store.appState === null || store.engineState === null ? null : (
          <CheckpointOutcome
            appState={store.appState}
            engineState={store.engineState}
            changes={checkpointChanges}
            onContinue={() => goTo({name: 'TODAY'})}
            onOpenPlan={() => goTo({name: 'PLAN'})}
          />
        );
      case 'WORKOUT_RESULT': {
        const workout = store.engineState?.queue.find((entry) => entry.id === effective.id) ?? null;
        if (workout !== null && workout.scheduledDate > store.today) {
          // A direct link cannot close a session that has not happened yet either.
          return <ResultTooEarly workout={workout} onBack={() => goTo({name: 'WORKOUT', id: effective.id})} />;
        }
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
