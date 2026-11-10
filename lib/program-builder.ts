import type { Content } from "./model";
export type ProgramExercise = Content["days"][number]["exercises"][number];

export function appendExercises(plan:Content,day:number,exercises:ProgramExercise[]):Content {
  if(!plan.days[day]||!exercises.length)return plan;
  const previous=plan.days[day].exercises;
  const rows=previous.length===1&&isStarterExercise(previous[0])?[]:previous;
  if(rows.length+exercises.length>40)return plan;
  return {...plan,days:plan.days.map((item,index)=>index===day?{...item,exercises:[...rows,...exercises.map(exercise=>({...structuredClone(exercise),rowId:crypto.randomUUID()}))]}:item)};
}

export function repeatProgramDay(plan: Content, source: number, name: string, weekday?: number): Content {
  if (!plan.days[source] || plan.days.length >= 14 || !name.trim() || name.trim().length > 100 || plan.days.some(day=>day.name===name.trim()) || (weekday!==undefined&&(!Number.isInteger(weekday)||weekday<0||weekday>6))) return plan;
  const copy={...structuredClone(plan.days[source]),name:name.trim(),weekday,exercises:plan.days[source].exercises.map(exercise=>({...structuredClone(exercise),rowId:crypto.randomUUID()}))};
  return {...plan,days:[...plan.days.slice(0,source+1),copy,...plan.days.slice(source+1)]};
}

export function customExercise(name: string): ProgramExercise {
  return { name: name.trim(), description: "", video: "", sets: 3, reps: "10–12", rest: 90, rowId: crypto.randomUUID() };
}

export function isStarterExercise(exercise: ProgramExercise) {
  return exercise.name === "تمرين جديد" && !exercise.description && !exercise.video && !exercise.mediaId && !exercise.catalogId &&
    exercise.sets === 3 && ["10", "10–12"].includes(exercise.reps) && exercise.rest === 60 &&
    exercise.weight === undefined && exercise.rpe === undefined && exercise.rir === undefined && !exercise.tempo;
}

export function appendExercise(plan: Content, day: number, exercise: ProgramExercise): Content {
  if (!plan.days[day]) return plan;
  const existing = plan.days[day].exercises;
  const rows = existing.length === 1 && isStarterExercise(existing[0]) ? [] : existing;
  if (rows.length >= 40) return plan;
  return { ...plan, days: plan.days.map((item,index) => index === day ? { ...item, exercises: [...rows, { ...exercise, rowId: crypto.randomUUID() }] } : item) };
}

export function transferExercise(plan: Content, source: number, row: number, target: number): Content {
  if (source === target || !plan.days[source]?.exercises[row] || !plan.days[target]) return plan;
  const exercise = plan.days[source].exercises[row];
  const added = appendExercise(plan, target, exercise);
  if (added === plan) return plan;
  return { ...added, days: added.days.map((item,index) => index === source ? { ...item, exercises: item.exercises.filter((_,i) => i !== row) } : index === target ? { ...item, exercises: item.exercises.map((entry,i) => i === item.exercises.length - 1 ? { ...entry, rowId: exercise.rowId } : entry) } : item) };
}
