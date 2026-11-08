"use server";
import { revalidatePath } from "next/cache";
import { requireCoach, rpc, readableError } from "@/lib/server";
import { prepareImport, ImportReviewError } from "@/lib/import-batch";
import type { Result } from "./actions";
export async function applyFullImport(input: unknown): Promise<Result> {
  try {
    const current = await requireCoach();
    const prepared = prepareImport(input, current);
    const result = await rpc<Record<string, unknown>>("management_command", {
      command: "import_data",
      payload: prepared.payload,
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: "اكتمل الاستيراد وحُفظ تقرير الدفعة",
      data: { ...result, errors: prepared.errors, unmapped: prepared.unmapped },
    };
  } catch (error) {
    return {
      ok: false,
      message: readableError(error),
      ...(error instanceof ImportReviewError
        ? { data: { errors: error.errors } }
        : {}),
    };
  }
}
