import {describe,expect,it} from "vitest";
import {appendExercise,customExercise,isStarterExercise,transferExercise} from "@/lib/program-builder";
import {blankContent,content,type Content} from "@/lib/model";

const plan=():Content=>({...structuredClone(blankContent),days:[{name:"A",exercises:[customExercise("تمرين خاص")]},{name:"B",exercises:[]}]});
describe("program builder",()=>{
  it("creates a custom exercise without any catalog or media requirement",()=>{
    const exercise=customExercise("  تمريني الخاص  ");
    expect(exercise.name).toBe("تمريني الخاص");expect(exercise.catalogId).toBeUndefined();
    const value={...plan(),days:[{name:"يومي",exercises:[exercise]}]};expect(content.safeParse(value).success).toBe(true);
  });
  it("replaces only an untouched starter and preserves edited exercises",()=>{
    expect(isStarterExercise(blankContent.days[0].exercises[0])).toBe(true);
    expect(isStarterExercise({...blankContent.days[0].exercises[0],sets:5})).toBe(false);
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
