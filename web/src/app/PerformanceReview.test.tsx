import {afterEach, describe, expect, test} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {createEngineState} from '../application/engineGateway.ts';
import {NOW, dateAfter, experienced, healthy, profile} from '../../../tests/helpers.ts';
import {Today} from '../ui/screens/Today.tsx';
import {Plan} from '../ui/screens/Plan.tsx';
import {PlanReady} from '../ui/screens/PlanReady.tsx';
import type {EngineState} from '../application/engineGateway.ts';
import type {Route} from './routes.ts';

afterEach(cleanup);

const base = (safety=healthy()):EngineState=>createEngineState(profile({
  ...experienced,
  performance:{timeSeconds:900,date:dateAfter(-50),source:'TEST_3K'},
  raceDate:dateAfter(90),
  targetTimeSeconds:870,
  availableRunsPerWeek:4, actualRunsPerWeek:4, averageWeeklyKm4Weeks:28,
  longestUsualRunKm:9, safety,
}), NOW);

describe('stale performance is not a medical stop', ()=>{
  test('Today displays the real easy workout and a result-update action', ()=>{
    const engine=base();
    const routes:Route[]=[];
    expect(engine.decision.phase).toBe('HOLD_DIAGNOSTIC');
    expect(engine.queue[0]?.type).toBe('EASY');
    render(<Today engineState={engine} today={NOW}
      onNavigate={r=>routes.push(r)} onRefreshPlan={()=>undefined} refreshing={false}
      onSkipPending={()=>undefined} busy={false} />);
    expect(screen.getByText('Нужно обновить результат на 3000 м')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Открыть тренировку'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Внести результат на 3000 м'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Повторно проверить состояние'})).not.toBeInTheDocument();
    expect(screen.queryByText('Обычные тренировки приостановлены')).not.toBeInTheDocument();
  });

  test('Plan and PlanReady show the engine-prescribed easy workouts instead of a medical recheck',()=>{
    const engine=base();
    const view=render(<Plan engineState={engine} today={NOW}
      onNavigate={()=>undefined} onRefreshPlan={()=>undefined} refreshing={false}/>);
    expect(screen.getByText('Нужно обновить результат на 3000 м')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Внести результат на 3000 м'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Открыть сегодняшнюю тренировку'})).toBeInTheDocument();
    view.unmount();
    render(<PlanReady engineState={engine} onContinue={()=>undefined} onRecheck={()=>undefined}/>);
    expect(screen.queryByRole('button',{name:'Повторно проверить состояние'})).not.toBeInTheDocument();
    expect(screen.getAllByText(/Спокойный бег/).length).toBeGreaterThan(0);
  });

  test('actual medical HOLD still hides training and preserves safety review',()=>{
    const engine=base({...healthy(),pain:3});
    render(<Today engineState={engine} today={NOW}
      onNavigate={()=>undefined} onRefreshPlan={()=>undefined} refreshing={false}
      onSkipPending={()=>undefined} busy={false}/>);
    expect(screen.getByText('Обычные тренировки приостановлены')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Повторно проверить состояние'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Открыть тренировку'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Внести результат на 3000 м'})).not.toBeInTheDocument();
  });
});
