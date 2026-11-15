"use client";
import { createContext, useContext } from "react";
import { FREE_PLATFORM_NOTICE } from "@/lib/billing-mode";
const BillingMode = createContext(false);
export function BillingModeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <BillingMode.Provider value={enabled}>{children}</BillingMode.Provider>;
}
export const useBillingEnabled = () => useContext(BillingMode);
export function FreePlatformNotice() {
  return useBillingEnabled() ? null : <span className="free-platform-notice" role="status">{FREE_PLATFORM_NOTICE}</span>;
}
