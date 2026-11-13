/** Readable change-log wording for row-level audit entries ("weight_entries:DELETE"). */
const TABLES: Record<string, Partial<Record<"INSERT" | "UPDATE" | "DELETE", string>>> = {
  clients: { INSERT: "إضافة متدرب", UPDATE: "تعديل بيانات متدرب", DELETE: "حذف متدرب" },
  client_goals: { INSERT: "تحديد هدف متدرب", UPDATE: "تحديث هدف متدرب", DELETE: "حذف هدف متدرب" },
  exercises: { INSERT: "إضافة تمرين للمكتبة", UPDATE: "تعديل تمرين في المكتبة", DELETE: "حذف تمرين من المكتبة" },
  templates: { INSERT: "إنشاء قالب", UPDATE: "تعديل قالب", DELETE: "حذف قالب" },
  programs: { INSERT: "إنشاء مسودة برنامج", UPDATE: "تحديث برنامج", DELETE: "حذف برنامج" },
  subscriptions: { INSERT: "إضافة اشتراك", UPDATE: "تعديل اشتراك", DELETE: "حذف اشتراك" },
  freezes: { INSERT: "تجميد اشتراك", DELETE: "إلغاء تجميد اشتراك" },
  payments: { INSERT: "تسجيل دفعة", DELETE: "حذف دفعة" },
  invitations: { INSERT: "إنشاء دعوة", UPDATE: "تحديث دعوة", DELETE: "حذف دعوة" },
  join_links: { INSERT: "إنشاء رابط انضمام", UPDATE: "تحديث رابط انضمام", DELETE: "حذف رابط انضمام" },
  join_requests: { INSERT: "طلب انضمام جديد", UPDATE: "مراجعة طلب انضمام", DELETE: "حذف طلب انضمام" },
  privacy_requests: { INSERT: "طلب خصوصية جديد", UPDATE: "معالجة طلب خصوصية", DELETE: "حذف طلب خصوصية" },
  weight_entries: { INSERT: "تسجيل قياس وزن", UPDATE: "تصحيح قياس وزن", DELETE: "حذف قياس وزن" },
};

/** Arabic label for an audit action; actions that are already sentences pass through. */
export function auditLabel(action: string) {
  const match = /^([a-z_]+):(INSERT|UPDATE|DELETE)$/.exec(action);
  if (!match) return action;
  return TABLES[match[1]]?.[match[2] as "INSERT" | "UPDATE" | "DELETE"] ?? "تعديل سجل";
}
export const auditLabels = () => Object.values(TABLES).flatMap((ops) => Object.values(ops));
