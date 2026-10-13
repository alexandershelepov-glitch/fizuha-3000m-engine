import {afterEach, expect, test} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createEngineState} from '../application/engineGateway.ts';
import type {WorkoutResult} from '../application/engineGateway.ts';
import {ResultForm} from '../ui/screens/ResultForm.tsx';
import {scaleLabels} from '../ui/copy/values.ts';
import {NOW, profile} from '../../../tests/helpers.ts';

afterEach(cleanup);
const makeWorkout=()=>createEngineState(profile({
  performance:null,canRun3Km:false,actualRunsPerWeek:2,availableRunsPerWeek:7,
  averageWeeklyKm4Weeks:10,longestUsualRunKm:6,
  raceDate:'2027-01-15',
}),NOW).queue[0]!;

test('PWA-FEEDBACK-01 two deliberate taps (including the default choices) are required to earn progression evidence',async()=>{
  const user=userEvent.setup(), workout=makeWorkout(), reported:WorkoutResult[]=[];
  render(<ResultForm workout={workout} storage={null} onCancel={()=>undefined}
    submit={result=>{reported.push(result);return {ok:true};}}/>);
  expect(screen.getByText(/Значение по умолчанию ещё не подтверждено/)).toBeInTheDocument();
  expect(screen.getByText(/Плановая оценка ещё не подтверждена/)).toBeInTheDocument();
  await user.click(screen.getByRole('radio',{name:'Выполнено полностью'}));
  const rpe=Math.round((workout.targetRpe[0]+workout.targetRpe[1])/2);
  await user.click(screen.getByRole('button',{name:scaleLabels[rpe]!}));
  await user.click(screen.getByRole('radio',{name:'Нет, всё нормально'}));
  await user.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(reported.length).toBe(1);
  expect(reported[0]?.feedbackConfirmed).toBe(true);
});
test('PWA-FEEDBACK-02 saving with only the safety answer is permitted but cannot authorize an easy mileage increase',async()=>{
  const user=userEvent.setup(), reported:WorkoutResult[]=[];
  render(<ResultForm workout={makeWorkout()} storage={null} onCancel={()=>undefined}
    submit={result=>{reported.push(result);return {ok:true};}}/>);
  await user.click(screen.getByRole('radio',{name:'Нет, всё нормально'}));
  await user.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(reported.length).toBe(1);
  expect(reported[0]?.feedbackConfirmed).toBeUndefined();
});
