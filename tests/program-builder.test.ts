import {describe,expect,it} from "vitest";
import {appendExercise,appendExercises,customExercise,isStarterExercise,transferExercise,repeatProgramDay} from "@/lib/program-builder";
import {blankContent,content,type Content} from "@/lib/model";

const plan=():Content=>({...structuredClone(blankContent),days:[{name:"A",exercises:[customExercise("تمرين خاص")]},{name:"B",exercises:[]}]});
describe("program builder",()=>{
  it("adds a selection atomically in its chosen order with independent row IDs",()=>{
    const initial=plan();const selected=[customExercise("أول اختيار"),customExercise("ثاني اختيار")];
    const next=appendExercises(initial,1,selected);expect(next.days[1].exercises.map(e=>e.name)).toEqual(["أول اختيار","ثاني اختيار"]);
    expect(next.days[0]).toBe(initial.days[0]);expect(initial.days[1].exercises).toHaveLength(0);
    expect(next.days[1].exercises[0].rowId).not.toBe(selected[0].rowId);
    next.days[1].exercises[0].sets=7;expect(selected[0].sets).toBe(3);
  });
  it("rejects the whole selection at capacity without partially changing the plan",()=>{
    const initial=plan();initial.days[0].exercises=Array.from({length:39},()=>customExercise("تمرين"));
    expect(appendExercises(initial,0,[customExercise("أ"),customExercise("ب")])).toBe(initial);
    expect(appendExercises(initial,8,[customExercise("أ")])).toBe(initial);
    expect(appendExercises(initial,0,[])).toBe(initial);expect(initial.days[0].exercises).toHaveLength(39);
  });
  it("repeats a complete session with independent rows, exact loading and a chosen weekday",()=>{
    const initial=plan();initial.days[0].weekday=2;initial.days[0].exercises[0]={...initial.days[0].exercises[0],sets:4,reps:"8–10",rest:120,weight:55,rpe:8,tempo:"3-1-1"};
    const next=repeatProgramDay(initial,0,"حصة ثانية",2);
    expect(next.days.map(day=>day.name)).toEqual(["A","حصة ثانية","B"]);expect(next.days[1].weekday).toBe(2);
    expect(next.days[1].exercises[0]).toMatchObject({sets:4,reps:"8–10",rest:120,weight:55,rpe:8,tempo:"3-1-1"});
    expect(next.days[1].exercises[0].rowId).not.toBe(initial.days[0].exercises[0].rowId);
    next.days[1].exercises[0].sets=5;expect(initial.days[0].exercises[0].sets).toBe(4);expect(next.days[0].exercises[0].sets).toBe(4);
  });
  it("can leave the repeated session unscheduled and rejects duplicate names or excess days",()=>{
    const initial=plan();initial.days[0].weekday=3;
    expect(repeatProgramDay(initial,0,"نسخة").days[1].weekday).toBeUndefined();
    expect(repeatProgramDay(initial,0,"A")).toBe(initial);expect(repeatProgramDay(initial,0," ")).toBe(initial);expect(repeatProgramDay(initial,0,"نسخة",7)).toBe(initial);
    const full={...initial,days:Array.from({length:14},(_,i)=>({name:String(i),exercises:[customExercise("تمرين")]}))};expect(repeatProgramDay(full,0,"زائد")).toBe(full);
  });
  it("creates a custom exercise without any catalog or media requirement",()=>{
    const exercise=customExercise("  تمريني الخاص  ");
    expect(exercise.name).toBe("تمريني الخاص");expect(exercise.catalogId).toBeUndefined();
    const value={...plan(),days:[{name:"يومي",exercises:[exercise]}]};expect(content.safeParse(value).success).toBe(true);
  });
  it("replaces only an untouched starter and preserves edited exercises",()=>{
    expect(isStarterExercise(blankContent.days[0].exercises[0])).toBe(true);
    expect(isStarterExercise({...blankContent.days[0].exercises[0],sets:5})).toBe(false);
    expect(isStarterExercise({...blankContent.days[0].exercises[0],coachNotes:"توجيه خاص"})).toBe(false);
    expect(appendExercise(structuredClone(blankContent),0,customExercise("جديد مخصص")).days[0].exercises).toHaveLength(1);
  });
  it("duplicates rows with a new identity and preserves their full prescription",()=>{
    const initial=plan();const first={...initial.days[0].exercises[0],weight:45,rpe:8,tempo:"3-1-1"};initial.days[0].exercises=[first];
    const next=appendExercise(initial,0,first);
    expect(next.days[0].exercises).toHaveLength(2);expect(next.days[0].exercises[1].rowId).not.toBe(first.rowId);
    expect(next.days[0].exercises[1]).toMatchObject({name:first.name,weight:45,rpe:8,tempo:"3-1-1"});expect(initial.days[0].exercises).toHaveLength(1);
  });
  it("moves a row once, retains its identity and keeps all other days intact",()=>{
    const initial=plan();const id=initial.days[0].exercises[0].rowId;
    const next=transferExercise(initial,0,0,1);
    expect(next.days[0].exercises).toHaveLength(0);expect(next.days[1].exercises).toHaveLength(1);expect(next.days[1].exercises[0].rowId).toBe(id);
    expect(initial.days[0].exercises).toHaveLength(1);
  });
  it("rejects missing targets and full days without dropping the source row",()=>{
    const initial=plan();initial.days[1].exercises=Array.from({length:40},()=>customExercise("تمرين"));
    expect(transferExercise(initial,0,0,1)).toBe(initial);expect(transferExercise(initial,0,0,9)).toBe(initial);
    expect(appendExercise(initial,1,customExercise("إضافي"))).toBe(initial);
  });
});
