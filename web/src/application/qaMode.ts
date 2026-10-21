import {deviceToday} from './format.ts';
/** Synthetic actions exist only on this isolated QA build and hostname. */
export const QA_HOST='fizuha-3000m-engine-feature-issue-42-qa-fastcycle.layero.app';
export const IS_QA_BUILD=import.meta.env.VITE_QA_MODE==='1' && typeof window!=='undefined' &&
  (window.location.hostname===QA_HOST || ['localhost','127.0.0.1'].includes(window.location.hostname));
export const QA_DATE_KEY='fizuha.qa.virtualDate.v1';
export const QA_DATE_EVENT='fizuha:qa-date-changed';
function validDate(value:string):boolean{
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value+'T00:00:00Z')) &&
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function qaToday():string|null{
  if(!IS_QA_BUILD)return null;
  try{const stored=window.localStorage.getItem(QA_DATE_KEY);
    return stored&&validDate(stored)?stored:null;}catch{return null;}
}
export function setQaToday(day:string):boolean{
  if(!IS_QA_BUILD||!validDate(day))return false;
  try{window.localStorage.setItem(QA_DATE_KEY,day);
    window.dispatchEvent(new Event(QA_DATE_EVENT));return true;}catch{return false;}
}
export function resetQaToday():void{
  if(!IS_QA_BUILD)return;
  try{window.localStorage.removeItem(QA_DATE_KEY);}catch{/* QA only */}
  window.dispatchEvent(new Event(QA_DATE_EVENT));
}
export function effectiveToday():string{return qaToday()??deviceToday();}
