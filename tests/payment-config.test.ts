import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({call:vi.fn(),client:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/platform/billing-store",()=>({billingCall:mocks.call}));
vi.mock("@/lib/paylink/client",async importOriginal=>{
 const original=await importOriginal<typeof import("@/lib/paylink/client")>();return {...original,createPaylinkClient:mocks.client};
});
import { paymentReadiness,platformMerchant } from "@/lib/platform/payment-config";
beforeEach(()=>{
 vi.stubEnv("PAYMENTS_ENABLED","false");vi.stubEnv("PAYLINK_SANDBOX","true");vi.stubEnv("PAYLINK_BASE_URL","https://restpilot.paylink.sa");
 vi.stubEnv("PAYLINK_VERIFIED","true");vi.stubEnv("VAT_NUMBER","");vi.stubEnv("VAT_RATE","");
 vi.stubEnv("PAYLINK_SANDBOX_API_ID","fictional-test-id");vi.stubEnv("PAYLINK_SANDBOX_SECRET_KEY","fictional-test-secret");
 vi.stubEnv("PAYLINK_LIVE_API_ID","fictional-live-id");vi.stubEnv("PAYLINK_LIVE_SECRET_KEY","fictional-live-secret");vi.stubEnv("PAYLINK_WEBHOOK_SECRET","fictional-hook");
 mocks.client.mockReset().mockReturnValue({auth:vi.fn()});mocks.call.mockReset().mockResolvedValue({verified:true,tax_ready:true});
});
it("requires the explicit Paylink approval environment flag even with verified database settings",async()=>{
 vi.stubEnv("PAYMENTS_ENABLED","true");vi.stubEnv("PAYLINK_VERIFIED","false");
 expect(await paymentReadiness()).toMatchObject({ready:false,verified:false,reason:"paylink_unverified"});
});
it("never invents an operator VAT rate or registration number",async()=>{
 vi.stubEnv("VAT_NUMBER","300000000000003");vi.stubEnv("VAT_RATE","");
 expect(await paymentReadiness()).toMatchObject({taxReady:false,reason:"tax_missing"});
 expect(mocks.call).not.toHaveBeenCalledWith("ec_billing_operator_config",expect.anything());
});
it("synchronizes explicit tax settings without approving the provider",async()=>{
 vi.stubEnv("VAT_NUMBER","300000000000003");vi.stubEnv("VAT_RATE","15");
 await paymentReadiness();
 expect(mocks.call).toHaveBeenCalledWith("ec_billing_operator_config",{registration_number:"300000000000003",vat_basis_points:1500,approve_provider:false});
});
afterEach(()=>vi.unstubAllEnvs());
it("defaults to disabled and blocks unverified provider even if the flag is enabled",async()=>{
 expect(await paymentReadiness()).toMatchObject({ready:false,blocked:"PROVIDER_NOT_READY"});
 vi.stubEnv("PAYMENTS_ENABLED","true");mocks.call.mockResolvedValue({verified:false,tax_ready:true});
 expect(await paymentReadiness()).toMatchObject({ready:false,blocked:"PROVIDER_NOT_READY"});
});
it("requires tax configuration before enabling trial/invoice buttons",async()=>{
 vi.stubEnv("PAYMENTS_ENABLED","true");mocks.call.mockResolvedValue({verified:true,tax_ready:false});
 expect(await paymentReadiness()).toMatchObject({ready:false,blocked:"TAX_NOT_CONFIGURED"});
 mocks.call.mockResolvedValue({verified:true,tax_ready:true});expect((await paymentReadiness()).ready).toBe(true);
});
it("selects separate sandbox/live credentials and refuses an environment/host mismatch",()=>{
 platformMerchant();expect(mocks.client).toHaveBeenLastCalledWith({baseUrl:"https://restpilot.paylink.sa",apiId:"fictional-test-id",secretKey:"fictional-test-secret"});
 vi.stubEnv("PAYLINK_SANDBOX","false");expect(platformMerchant()).toBeNull();
 vi.stubEnv("PAYLINK_BASE_URL","https://restapi.paylink.sa");platformMerchant();
 expect(mocks.client).toHaveBeenLastCalledWith({baseUrl:"https://restapi.paylink.sa",apiId:"fictional-live-id",secretKey:"fictional-live-secret"});
});
