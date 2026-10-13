import {useRef, useState} from 'react';
import type {ReactNode} from 'react';
import type {EngineState} from '../../application/engineGateway.ts';
import type {UiError} from '../../application/errorContract.ts';
import {formatDateLong} from '../../application/format.ts';
import {copyForError} from '../copy/errors.ts';
import {Button} from '../components/Button.tsx';
import {Card, Notice} from '../components/Layout.tsx';
import {Field, TextInput} from '../components/Field.tsx';

export const continuous3kText = {
  action: 'Подтвердить: пробежал 3 км без остановки',
  title: 'Я пробежал 3000 метров без остановки',
  intro: 'Это подтверждение выносливости, а не сдача норматива на время. Отмечайте только пробежку, которая действительно состоялась.',
  date: 'Когда вы пробежали 3000 м?',
  completion: 'Я пробежал все 3000 м подряд: без ходьбы и остановок.',
  symptoms: 'Во время и после пробежки не было боли, отёка, необычного недомогания или других тревожных симптомов.',
  save: 'Подтвердить и обновить план',
  note: 'После подтверждения программа заменит чередование бега и ходьбы на спокойный непрерывный бег. Время на 3000 м останется неизвестным, пока вы отдельно его не измерите. Быстрые тренировки без такого результата не назначаются.',
} as const;

interface Props {
  readonly engineState: EngineState;
  readonly today: string;
  readonly submit: (runDate: string, completed: boolean, noSymptoms: boolean) => {ok:boolean; error?:UiError};
  readonly onCancel: () => void;
}
export function Continuous3kConfirmation({engineState,today,submit,onCancel}: Props): ReactNode {
  const [runDate,setRunDate]=useState(today);
  const [completed,setCompleted]=useState(false);
  const [noSymptoms,setNoSymptoms]=useState(false);
  const [error,setError]=useState<UiError|null>(null);
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const available=!engineState.profile.canRun3Km && !engineState.finalResultRecorded &&
    engineState.decision.safety==='OK' && !engineState.diagnosticHold &&
    !engineState.relatedYellow && !engineState.progressionBlocked && engineState.reentry===null;

  function save():void {
    if(inFlight.current || !available)return;
    inFlight.current=true;
    setBusy(true);
    setError(null);
    const result=submit(runDate,completed,noSymptoms);
    if(!result.ok){
      setError(result.error??null);
      setBusy(false);
      inFlight.current=false;
    }
  }
  const copy=error?copyForError(error):null;
  return <div className="screen">
    <header className="appbar"><div>
      <h1 className="appbar__title">{continuous3kText.title}</h1>
      <p className="appbar__subtitle">ФИЗУХА — 3000 м</p>
    </div></header>
    <Card>
      <p className="paragraph">{continuous3kText.intro}</p>
      <p className="hint">{continuous3kText.note}</p>
    </Card>
    {!available?<Notice tone="warn" title="Сейчас подтверждение недоступно">
      <p>Сначала завершите восстановление или проверку самочувствия. Если 3000 м уже подтверждены, откройте план.</p>
    </Notice>:null}
    {copy?<Notice tone="danger" title={copy.title}><p>{copy.text(error!.params)}</p></Notice>:null}
    <Card>
      <Field id="continuous-3k-date" label={continuous3kText.date}
        hint={`Не позднее ${formatDateLong(today)}`}>
        <TextInput id="continuous-3k-date" type="date" value={runDate} onChange={setRunDate}/>
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)}/>
        <span>{continuous3kText.completion}</span>
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={noSymptoms} onChange={e=>setNoSymptoms(e.target.checked)}/>
        <span>{continuous3kText.symptoms}</span>
      </label>
    </Card>
    <div className="actions">
      <Button disabled={busy||!available} onClick={save}>{continuous3kText.save}</Button>
      <Button variant="ghost" onClick={onCancel}>Вернуться без изменений</Button>
    </div>
  </div>;
}
