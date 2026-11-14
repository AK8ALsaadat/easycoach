import Link from "next/link";
import { policyLinks } from "@/lib/legal";
export function LegalLinks({ className = "" }: { className?: string }) {
  return <nav aria-label="المعلومات القانونية والتواصل" className={`legal-links ${className}`}>{policyLinks.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>;
}
