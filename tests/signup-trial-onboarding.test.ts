import { beforeEach,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({rpc:vi.fn(),start:vi.fn(),identity:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/server",()=>({rpc:mock.rpc,requireCoachIdentity:mock.identity}));
vi.mock("@/lib/platform/server",()=>({startPlatformTrial:mock.start}));
import {completeSignupTrial} from "@/lib/platform/onboarding";
beforeEach(()=>{vi.clearAllMocks();mock.identity.mockResolvedValue(undefined);mock.rpc.mockReset().mockResolvedValue({mode:"managed",trial_used_at:null,period_end:null});mock.start.mockReset().mockResolvedValue({});});
it("starts the default trial immediately after requested verified coach signup",async()=>{
  expect(await completeSignupTrial("coach","/coach",true)).toBe("/coach?trial=started");
  expect(mock.start).toHaveBeenCalledExactlyOnceWith("pro");
});
it("preserves a selected plan, trainees, invitation routing and registrations without trial intent",async()=>{
  await completeSignupTrial("coach","/start?plan=starter",true);expect(mock.start).toHaveBeenCalledWith("starter");mock.start.mockClear();
  expect(await completeSignupTrial("trainee","/coach",true)).toBe("/me");
  const invite="/invite/"+"a".repeat(64);expect(await completeSignupTrial("coach",invite,true)).toBe(invite);
  expect(await completeSignupTrial("coach","/coach",false)).toBe("/start");expect(mock.start).not.toHaveBeenCalled();
});
it("does not change legacy/paid/previously trialed accounts or restart a campaign",async()=>{
  for(const state of [{mode:"legacy"},{mode:"managed",trial_used_at:"used"},{mode:"managed",period_end:"paid"},{mode:"managed",cancelled_at:"cancelled"}]){mock.rpc.mockResolvedValue(state);expect(await completeSignupTrial("coach","/coach",true)).toBe("/coach");}
  expect(mock.start).not.toHaveBeenCalled();
});
it("keeps a verified user in a recoverable flow when enrollment is unavailable",async()=>{
  mock.start.mockRejectedValue(Error("trial_unavailable"));expect(await completeSignupTrial("coach","/coach",true)).toBe("/start?error=trial");
  mock.rpc.mockRejectedValue(Error("network"));expect(await completeSignupTrial("coach","/coach",true)).toBe("/start?error=trial");
});
