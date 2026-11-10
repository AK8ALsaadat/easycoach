import type { Snapshot } from "./model";
import { actualMacros, effectiveNutrition } from "./management";
import { addDays, riyadhToday } from "./dates";

export function clientInsights(data: Snapshot, clientId: string, today = riyadhToday()) {
  const records = (data.management?.records ?? []).filter(r => r.client_id === clientId);
  const published = data.programs.filter(p => p.client_id === clientId && p.published_at).sort((a,b)=>b.published_at!.localeCompare(a.published_at!))[0];
  const nutrition = effectiveNutrition(records, clientId, published?.published_at, today) ?? published?.content.nutrition;
  const weights = (data.weights ?? []).filter(w => w.client_id === clientId && w.entry_date <= today && Number.isFinite(Number(w.weight))).sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
  const actual = actualMacros(records, clientId).filter(r=>r.entry_date<=today && typeof r.payload.calories === "number" && Number.isFinite(r.payload.calories));
  const recent = actual.filter(r=>r.entry_date>=addDays(today,-6));
  const events = [
    ...data.programs.filter(p=>p.client_id===clientId && p.published_at).map(p=>({date:riyadhToday(new Date(p.published_at!)),created:p.published_at!,value:p.content.nutrition.calories})),
    ...records.filter(r=>r.kind==="nutrition_target" && typeof r.payload.calories==="number").map(r=>({date:r.entry_date,created:r.created_at,value:Number(r.payload.calories)})),
  ].filter(e=>e.date<=today && Number.isFinite(e.value)).sort((a,b)=>a.date.localeCompare(b.date)||a.created.localeCompare(b.created));
  const byDay = new Map<string,number>();for(const event of events)byDay.set(event.date,event.value);
  return {
    published, nutrition,
    weights: weights.map(w=>({date:w.entry_date,value:Number(w.weight)})),
    weightChange: weights.length>1 ? Number(weights.at(-1)!.weight)-Number(weights[0].weight) : null,
    actualCalories: actual.map(r=>({date:r.entry_date,value:Number(r.payload.calories)})),
    averageCalories: recent.length ? recent.reduce((sum,r)=>sum+Number(r.payload.calories),0)/recent.length : null,
    calorieTargets: [...byDay].map(([date,value])=>({date,value})),
    photos: (data.management?.progress_photos ?? []).filter(p=>p.client_id===clientId && p.status==="ready"),
    goal: data.client_goals?.find(g=>g.client_id===clientId),
  };
}
