"use client";
import { useBillingEnabled } from "./billing-mode-provider";
import Link from "next/link";
import { policyLinks } from "@/lib/legal";
export function LegalLinks({ className = "" }: { className?: string }) {
  const billing = useBillingEnabled();
  return <nav aria-label="المعلومات القانونية والتواصل" className={`legal-links ${className}`}>{policyLinks.filter(link => billing || link.href !== "/terms#cancellation").map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>;
}
