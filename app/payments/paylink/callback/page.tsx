import type { Metadata } from "next";
import { cookies } from "next/headers";
import { translator } from "@/lib/i18n";
import { PaylinkService } from "@/lib/paylink/service";
import { paylinkReturnParams, returnQuery } from "@/lib/paylink/params";
import { PaylinkResult } from "@/components/paylink-result";
import type { VerifyResult } from "@/lib/paylink/flow";

export const metadata: Metadata = { title: "نتيجة الدفع", robots: { index: false } };

/** Paylink returns here after payment. The URL decides nothing: getInvoice on the server does. */
export default async function PaylinkCallback({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tr = translator((await cookies()).get("ec_language")?.value === "en" ? "en" : "ar");
  const params = paylinkReturnParams(await searchParams);
  let result: VerifyResult;
  try {
    result = await PaylinkService.verify(params);
  } catch {
    result = { state: "error", errors: [] };
  }
  return <PaylinkResult result={result} tr={tr} retryHref={`/payments/paylink/callback?${returnQuery(params)}`} />;
}
