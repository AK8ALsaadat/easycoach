import {describe,it,expect} from "vitest";
import {clientRoster,rosterCounts,rosterMatches,compareRoster} from "@/lib/client-roster";
import type {Snapshot,Client,Program} from "@/lib/model";
import {blankContent} from "@/lib/model";

const today="2026-11-10";
const client=(id:string,archived=false)=>({id,name:`Client ${id}`,email:`${id}@example.test`,phone:"",archived,created_at:"2026-11-09T12:00:00Z"}) as Client;
const program=(id:string,published=true)=>({id:`p-${id}`,client_id:id,published_at:published?"2026-11-09T12:00:00Z":null,content:structuredClone(blankContent)}) as Program;
function fixture(){return {clients:[client("a"),client("b"),client("inactive"),client("archived",true)],programs:[program("b")],subscriptions:[],weights:[],management:{details:[{client_id:"inactive",status:"inactive"}],records:[],preferences:{reminders:false},progress_photos:[]}} as unknown as Snapshot;}
describe("actionable trainee roster",()=>{
  it("counts actual work without calling missing activity a success, excluding archived and inactive clients from queues",()=>{
    const rows=clientRoster(fixture(),today);expect(rosterCounts(rows)).toEqual({all:3,attention:1,program:1,renew:0});
    expect(rows.find(r=>r.client.id==="b")).toMatchObject({priority:0,latestWeight:undefined,checkin:undefined});
    expect(rows.filter(r=>rosterMatches(r,"program","")).map(r=>r.client.id)).toEqual(["a"]);
    expect(rows.filter(r=>rosterMatches(r,"archived","")).map(r=>r.client.id)).toEqual(["archived"]);
  });
  it("prioritizes unread trainee messages ahead of missing programs and leaves the source snapshot intact",()=>{
    const data=fixture();data.management!.records=[{id:"message",coach_id:"coach",client_id:"b",kind:"message",author_type:"client",author_id:null,read_at:null,reviewed_at:null,coach_feedback:"",source_key:"message",created_at:"2026-11-10T12:00:00Z",entry_date:today,payload:{text:"hello"}}];
    const original=structuredClone(data);const rows=clientRoster(data,today).sort((a,b)=>compareRoster(a,b,"priority","en"));
    expect(rows.map(r=>r.client.id)).toEqual(["b","a","archived","inactive"]);expect(rows[0].alerts.some(a=>a.urgent)).toBe(true);expect(data).toEqual(original);
  });
  it("uses the latest two measured weights, ignores other clients and future values, and distinguishes drafts",()=>{
    const data=fixture();data.programs.push(program("a",false));data.weights=[{client_id:"a",entry_date:"2026-11-01",weight:90},{client_id:"a",entry_date:"2026-11-10",weight:88.5},{client_id:"a",entry_date:"2026-11-11",weight:100},{client_id:"b",entry_date:today,weight:75}] as Snapshot["weights"];
    const row=clientRoster(data,today).find(r=>r.client.id==="a")!;expect(row).toMatchObject({draft:true,needsProgram:true,weightChange:-1.5,latestWeight:{weight:88.5}});expect(row.weights).toHaveLength(2);expect(row.nutrition).toBeUndefined();
  });
  it("does not count an old subscription as due when a future renewal already exists",()=>{
    const data=fixture();data.subscriptions=[{client_id:"a",start_date:"2026-10-01",end_date:today},{client_id:"a",start_date:"2026-11-11",end_date:"2026-12-10"},{client_id:"b",start_date:"2026-10-01",end_date:today}] as Snapshot["subscriptions"];
    const rows=clientRoster(data,today);expect(rows.find(r=>r.client.id==="a")?.renew).toBe(false);expect(rows.find(r=>r.client.id==="b")?.renew).toBe(true);expect(rosterCounts(rows).renew).toBe(1);
  });
  it("combines search with queue filters and consistently sorts missing dates last",()=>{
    const rows=clientRoster(fixture(),today);expect(rows.filter(r=>rosterMatches(r,"program"," a ")).map(r=>r.client.id)).toEqual(["a"]);expect(rows.filter(r=>rosterMatches(r,"attention","Client b"))).toHaveLength(0);
    expect([...rows].sort((a,b)=>compareRoster(a,b,"renewal","en")).map(r=>r.client.id)).toEqual(["a","archived","b","inactive"]);
  });
});
