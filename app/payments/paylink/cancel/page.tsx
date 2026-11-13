import type { Metadata } from "next";
import { cookies } from "next/headers";
import { translator } from "@/lib/i18n";
import { PaylinkService } from "@/lib/paylink/service";
import { paylinkReturnParams } from "@/lib/paylink/params";
import { PaylinkResult } from "@/components/paylink-result";
import type { VerifyResult } from "@/lib/paylink/flow";

export const metadata: Metadata = { title: "إلغاء الدفع", robots: { index: false } };

/** The payer left Paylink's page. Still ask Paylink, in case the payment went through first. */
export default async function PaylinkCancel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tr = translator((await cookies()).get("ec_language")?.value === "en" ? "en" : "ar");
  const params = paylinkReturnParams(await searchParams);
  let result: VerifyResult = { state: "canceled", errors: [] };
  if (params.transactionNo || params.orderNumber) {
    try {
      const verified = await PaylinkService.verify(params);
      if (verified.state === "paid" || verified.state === "review") result = verified;
    } catch {
      // Nothing was confirmed; the cancel message stands.
    }
  }
  return <PaylinkResult result={result} tr={tr} cancelled />;
}
