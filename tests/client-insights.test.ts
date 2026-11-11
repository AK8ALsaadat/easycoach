import {describe,expect,it} from "vitest";
import {clientInsights} from "@/lib/client-insights";
import {whatsappUrl} from "@/lib/contact";
import type {Snapshot} from "@/lib/model";
import type {CoachingRecord} from "@/lib/management";

const record=(kind:CoachingRecord["kind"],date:string,calories:number,created:string,client="a"):CoachingRecord=>({id:created,client_id:client,coach_id:"coach",kind,entry_date:date,created_at:created,payload:{calories,protein:100,carbs:200,fat:50,text:""},author_id:null,author_type:"coach",source_key:created,reviewed_at:null,coach_feedback:"",read_at:null});
function fixture(){return {programs:[],weights:[],client_goals:[],management:{records:[],progress_photos:[]}} as unknown as Snapshot;}
describe("trainee overview data",()=>{
  it("uses the latest log each day and averages recorded days instead of missing days",()=>{
    const data=fixture();data.management!.records=[record("nutrition_log","2026-11-09",2000,"2026-11-09T12:00:00Z"),record("nutrition_log","2026-11-09",2200,"2026-11-09T13:00:00Z"),record("nutrition_log","2026-11-10",0,"2026-11-10T12:00:00Z"),record("nutrition_log","2026-11-11",9000,"2026-11-10T13:00:00Z"),record("nutrition_log","2026-11-10",5000,"2026-11-10T12:01:00Z","other")];
    const result=clientInsights(data,"a","2026-11-10");expect(result.actualCalories).toEqual([{date:"2026-11-09",value:2200},{date:"2026-11-10",value:0}]);expect(result.averageCalories).toBe(1100);
  });
  it("filters other clients, future weights and unfinished photos without inventing empty stats",()=>{
    const data=fixture();data.weights=[{client_id:"a",entry_date:"2026-11-01",weight:80},{client_id:"a",entry_date:"2026-11-10",weight:78.5},{client_id:"a",entry_date:"2026-11-11",weight:100},{client_id:"b",entry_date:"2026-11-10",weight:120}] as Snapshot["weights"];
    data.management!.progress_photos=[{id:"p",client_id:"a",status:"ready",entry_date:"2026-11-10",filename:"a.png",angle:"front",consented_at:"2026-11-10T12:00:00Z",created_at:"2026-11-10T12:00:00Z"},{id:"x",client_id:"b",status:"ready",entry_date:"2026-11-10",filename:"b.png",angle:"side",consented_at:"2026-11-10T12:00:00Z",created_at:"2026-11-10T12:00:00Z"},{id:"pending",client_id:"a",status:"pending",entry_date:"2026-11-10",filename:"c.png",angle:"front",consented_at:null,created_at:"2026-11-10T12:00:00Z"}];
    const result=clientInsights(data,"a","2026-11-10");expect(result.weightChange).toBe(-1.5);expect(result.weights).toHaveLength(2);expect(result.photos.map(p=>p.id)).toEqual(["p"]);expect(result.nutrition).toBeUndefined();expect(result.averageCalories).toBeNull();
  });
  it("separates scheduled targets from the current target and preserves zero targets",()=>{
    const data=fixture();data.management!.records=[record("nutrition_target","2026-11-08",2000,"2026-11-08T12:00:00Z"),record("nutrition_target","2026-11-10",0,"2026-11-10T12:00:00Z"),record("nutrition_target","2026-11-11",2500,"2026-11-10T13:00:00Z")];
    const result=clientInsights(data,"a","2026-11-10");expect(result.nutrition?.calories).toBe(0);expect(result.calorieTargets).toEqual([{date:"2026-11-08",value:2000},{date:"2026-11-10",value:0}]);
  });
});
describe("WhatsApp contact links",()=>{
  it("normalizes Saudi local, international and Arabic-digit phone numbers",()=>{
    for(const phone of ["0501234567","+966 50 123 4567","00966501234567","٠٥٠١٢٣٤٥٦٧"])expect(whatsappUrl(phone)).toBe("https://wa.me/966501234567");
  });
  it("rejects empty, malformed and short numbers and escapes optional message text",()=>{
    for(const phone of ["","123","05abc1234567","javascript:alert(1)"])expect(whatsappUrl(phone)).toBeUndefined();
    expect(whatsappUrl("0501234567","a&b")).toBe("https://wa.me/966501234567?text=a%26b");
  });
});
