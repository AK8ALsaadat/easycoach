"use client";
import { traineeCheckinStatus } from "@/lib/checkin-status";
import type { ManagementData, CoachingRecord } from "@/lib/management";
import type { WeightEntry } from "@/lib/model";
import { useLocale } from "./locale-provider";

export function TraineeCheckinStatus({
  clientId,
  today,
  weights,
  records,
  management,
}: {
  clientId: string;
  today: string;
  weights: WeightEntry[];
  records: CoachingRecord[];
  management?: ManagementData;
}) {
  const { t: tr } = useLocale();
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label={tr("حالة المتابعة")}>
      {traineeCheckinStatus(clientId, today, weights, records, management).map((item) => (
        <span className="badge" key={item.kind}>
          {tr(item.kind === "weight" ? "الوزن" : item.kind === "measurement" ? "القياسات" : "الصور")}: {item.daysRemaining === null ? tr("بانتظار أول تحديث") : item.due ? tr("حان موعد التحديث") : tr("متبقي") + " " + item.daysRemaining + " " + tr("يوم")}
        </span>
      ))}
    </div>
  );
}
