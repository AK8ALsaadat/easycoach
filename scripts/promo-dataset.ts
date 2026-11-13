import { createHash } from "node:crypto";
import type { Content } from "../lib/model.ts";
import type { RecordKind } from "../lib/management.ts";

/** Pure deterministic fixtures. This module has no database, auth or network access. */
export const PROMO_VERSION = "easycoach-promo-v1";
export function promoId(key: string) {
  const hex = createHash("sha256").update(`${PROMO_VERSION}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const shift = (day: string, amount: number) => {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const timestamp = (day: string, hour = 15) => `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const round = (value: number) => Math.round(value * 10) / 10;
const names = ["عبدالله العتيبي", "محمد القحطاني", "خالد الدوسري", "سارة الحربي", "نورة الشهري", "ريم المطيري", "فهد الغامدي", "عبدالرحمن الزهراني", "أحمد السبيعي", "ليان العنزي", "عمر المالكي", "رغد القرني", "يوسف الشمري", "هند الأسمري", "سلطان الرشيدي", "جود العمري", "تركي السهلي", "مها البقمي", "راشد اليامي", "دانا الجهني", "بندر الزيد", "أمل العبدلي", "مشعل الحربي", "الجوهرة القحطاني", "نايف الدوسري", "لطيفة العتيبي", "إبراهيم الغامدي", "شهد الشهراني", "وليد الحازمي", "عبير الحربي", "صالح المطيري", "منى السبيعي", "فيصل الحربي", "هيا الشمري", "زياد الزهراني", "دلال القرني", "حسن المالكي", "أروى العنزي", "عبدالعزيز العمري", "غادة اليامي"];
const female = new Set([3, 4, 5, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39]);
const cities = ["الرياض", "جدة", "الدمام", "الخبر", "مكة", "المدينة", "أبها", "الطائف", "بريدة", "تبوك"];
const note = "سجل اصطناعي مُعد للعرض والتصوير؛ ليس تجربة متدرب حقيقي.";

export type PromoRecord = {
  id: string; kind: RecordKind; entry_date: string; payload: Record<string, unknown>;
  author_type: "coach" | "client"; source_key: string; created_at: string; updated_at: string;
  reviewed_at: string | null; coach_feedback: string; read_at: string | null;
};
export type PromoPayment = { id: string; amount: number; method: "bank" | "cash" | "other"; paid_date: string; reference: string; created_at: string };
export type PromoFreeze = { id: string; start_date: string; end_date: string; days: number; applied_at: string };
export type PromoSubscription = { id: string; name: string; start_date: string; end_date: string; price: number; previous_id: string | null; created_at: string; payments: PromoPayment[]; freezes: PromoFreeze[] };
export type PromoClient = {
  id: string; name: string; email: string; phone: string; city: string; joined: string;
  details: { age: number; gender: "male" | "female"; height: number; start_date: string; status: "active" | "inactive" | "new" };
  goal: { goal: string; target_weight: number; focus: string; notes: string };
  successCase: boolean; accountRequested: boolean; scenario: "fat_loss" | "muscle_gain" | "general_fitness" | "plateau";
  program: { id: string; name: string; content: Content; published_at: string; created_at: string };
  weights: { id: string; entry_date: string; weight: number; updated_at: string }[];
  records: PromoRecord[]; subscriptions: PromoSubscription[];
  schedule: { weight_days: number; measurement_days: number; photo_days: number };
  outcome: { startWeight: number; currentWeight: number; weightChange: number; firstLoad: number; currentLoad: number };
};

function programFor(index: number, goal: PromoClient["scenario"], phase = 2): Content {
  const gain = goal === "muscle_gain";
  const protein = gain ? 145 + index % 4 * 10 : 130 + index % 4 * 5;
  const carbs = gain ? 285 + index % 3 * 20 : 185 + index % 3 * 15;
  const fat = gain ? 70 : 60;
  const fullBody = [
    [["سكوات بالبار", "Barbell_Squat"], ["ضغط صدر بالبار", "Barbell_Bench_Press_-_Medium_Grip"], ["سحب بار منحني", "Bent_Over_Barbell_Row"]],
    [["الرفعة الرومانية", "Romanian_Deadlift"], ["ضغط كتف بالدمبل", "Dumbbell_Shoulder_Press"], ["سحب علوي قبضة واسعة", "Wide-Grip_Lat_Pulldown"]],
    [["سكوات بالبار", "Barbell_Squat"], ["سحب بار منحني", "Bent_Over_Barbell_Row"], ["بايسبس بالدمبل", "Dumbbell_Bicep_Curl"]],
  ];
  const upperLower = [
    [["ضغط صدر بالبار", "Barbell_Bench_Press_-_Medium_Grip"], ["سحب بار منحني", "Bent_Over_Barbell_Row"], ["ضغط كتف بالدمبل", "Dumbbell_Shoulder_Press"]],
    [["سكوات بالبار", "Barbell_Squat"], ["الرفعة الرومانية", "Romanian_Deadlift"], ["رفع السمانة واقفًا", "Standing_Calf_Raises"]],
    [["سحب علوي قبضة واسعة", "Wide-Grip_Lat_Pulldown"], ["ضغط صدر مائل بالدمبل", "Incline_Dumbbell_Press"], ["بايسبس بالدمبل", "Dumbbell_Bicep_Curl"]],
    [["ضغط الأرجل", "Leg_Press"], ["ثني الأرجل مستلقيًا", "Lying_Leg_Curls"], ["رفع السمانة واقفًا", "Standing_Calf_Raises"]],
  ];
  const pushPullLegs = [
    [["ضغط صدر بالبار", "Barbell_Bench_Press_-_Medium_Grip"], ["ضغط كتف بالدمبل", "Dumbbell_Shoulder_Press"], ["دفع ترايسبس بالكابل", "Triceps_Pushdown"]],
    [["سحب بار منحني", "Bent_Over_Barbell_Row"], ["سحب علوي قبضة واسعة", "Wide-Grip_Lat_Pulldown"], ["بايسبس بالدمبل", "Dumbbell_Bicep_Curl"]],
    [["سكوات بالبار", "Barbell_Squat"], ["الرفعة الرومانية", "Romanian_Deadlift"], ["رفع السمانة واقفًا", "Standing_Calf_Raises"]],
  ];
  const split = index % 3;
  const prescription = [fullBody, upperLower, pushPullLegs][split];
  const dayNames = split === 1 ? ["علوي أ", "سفلي أ", "علوي ب", "سفلي ب"] : split === 2 ? ["دفع", "سحب", "أرجل"] : ["كامل الجسم أ", "كامل الجسم ب", "كامل الجسم ج"];
  const weekdays = split === 1 ? [0, 1, 3, 4] : [0, 2, 4];
  return {
    days: prescription.map((exercises, day) => ({ name: dayNames[day], weekday: weekdays[day], exercises: exercises.map(([name, catalogId], exercise) => ({
      name, catalogId, description: "", video: "", sets: phase === 0 ? 2 : gain ? 4 : 3, reps: phase === 0 ? "10–12" : gain ? "6–10" : "10–12", rest: exercise === 0 ? 120 : 90,
      coachNotes: exercise === 0 ? "ابدأ بمجموعات إحماء خفيفة. حافظ على حركة متحكم بها واترك تكرارين في الاحتياط." : "اختر حملًا يسمح بإتمام التكرارات بهدوء. دوّن الحمل الفعلي بعد الحصة.",
      rowId: promoId(`client:${index}:phase:${phase}:day:${day}:exercise:${exercise}`),
    })) })),
    nutrition: {
      protein, carbs, fat, calories: protein * 4 + carbs * 4 + fat * 9, calories_mode: "auto",
      text: "وزّع البروتين على وجباتك المعتادة، واختر البدائل التي تناسب يومك. راجع المدرب عند الحاجة إلى تعديل الخطة.",
      meals: [
        { name: "الفطور", time: "08:00", foods: "بيض مع خبز حبوب كاملة وخضار، أو زبادي مع شوفان وفاكهة.", protein: 35, carbs: 50, fat: 15, calories: 475 },
        { name: "الغداء", time: "14:00", foods: "دجاج مشوي مع أرز وسلطة. يمكن استبدال الدجاج بالسمك أو البقول.", protein: 50, carbs: 75, fat: 20, calories: 680 },
        { name: "العشاء والوجبة الخفيفة", time: "20:00", foods: "وجبة منزلية متوازنة مع مصدر بروتين وفاكهة؛ اضبط الكمية للوصول إلى هدف اليوم.", protein: protein - 85, carbs: carbs - 125, fat: fat - 35, calories: (protein - 85) * 4 + (carbs - 125) * 4 + (fat - 35) * 9 },
      ],
    },
  };
}

function subscriptionsFor(index: number, joined: string, today: string, inactive: boolean): PromoSubscription[] {
  const rows: PromoSubscription[] = [];
  let start = joined;
  const stop = inactive ? shift(today, -25) : today;
  while (start <= stop) {
    const ordinal = rows.length;
    const id = promoId(`client:${index}:subscription:${ordinal}`);
    const ordinaryEnd = shift(start, 89);
    const current = ordinaryEnd >= today;
    const freezeNow = current && !inactive && [8, 24].includes(index);
    const freeze = freezeNow || index % 8 === 0 && ordinal === 0 && shift(start, 34) <= today;
    const nearExpiry = current && !inactive && [15, 27].includes(index);
    const baseEnd = current && inactive ? shift(today, -10 - index % 8) : nearExpiry ? shift(today, 3 + index % 4) : ordinaryEnd;
    const end = shift(baseEnd, freeze ? 7 : 0);
    const price = 900 + index % 5 * 150;
    const unpaid = end >= today && index % 11 === 7;
    const partial = end >= today && index % 7 === 3;
    const payments: PromoPayment[] = unpaid ? [] : [{ id: promoId(`client:${index}:subscription:${ordinal}:payment:0`), amount: partial ? price / 2 : price, method: index % 5 === 2 ? "cash" : "bank", paid_date: start, reference: `PROMO-V1-${index + 1}-${ordinal + 1}`, created_at: timestamp(start) }];
    rows.push({ id, name: nearExpiry || current && inactive ? "متابعة تدريب وتغذية · فترة مخصصة" : "متابعة تدريب وتغذية · 3 أشهر", start_date: start, end_date: end, price, previous_id: rows.at(-1)?.id ?? null, created_at: timestamp(start), payments,
      freezes: freeze ? [{ id: promoId(`client:${index}:freeze:${ordinal}`), start_date: freezeNow ? shift(today, -2) : shift(start, 28), end_date: freezeNow ? shift(today, 4) : shift(start, 34), days: 7, applied_at: timestamp(freezeNow ? shift(today, -3) : shift(start, 27)) }] : [] });
    const next = shift(end, 1);
    if (inactive && next > shift(today, -90)) break;
    start = next;
  }
  return rows;
}

/** Generates a coherent 12-month business history, with no claim of real results. */
export function buildPromoDataset(today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today + "T12:00:00Z")) || new Date(today + "T12:00:00Z").toISOString().slice(0, 10) !== today) throw Error("Expected a valid YYYY-MM-DD date");
  const clients: PromoClient[] = names.map((name, index) => {
    const duration = index < 6 ? 364 - index * 11 : Math.round(330 * (1 - (index - 6) / 33) ** 1.8) + 3;
    const joined = shift(today, -duration);
    const inactive = [16, 23, 31].includes(index);
    const scenario: PromoClient["scenario"] = index < 3 ? "fat_loss" : index < 6 ? "muscle_gain" : index % 9 === 0 ? "plateau" : index % 3 === 0 ? "muscle_gain" : index % 3 === 1 ? "fat_loss" : "general_fitness";
    const successCase = index < 6;
    const startWeight = index < 3 ? [104, 96, 112][index] : scenario === "muscle_gain" ? (female.has(index) ? 54 : 65) + index % 5 : female.has(index) ? 70 + index % 8 : 84 + index % 13;
    const totalChange = index < 3 ? -[12, 15, 18][index] : index < 6 ? index + 1 : scenario === "fat_loss" ? -(3 + index % 7) : scenario === "muscle_gain" ? 2 + index % 4 : scenario === "plateau" ? -0.7 : -1.5;
    const height = female.has(index) ? 157 + index % 13 : 169 + index % 16;
    const firstLoad = female.has(index) ? 20 + index % 4 * 2.5 : 40 + index % 5 * 5;
    const lastOffset = inactive ? 28 : index % 10 === 8 ? 15 : index % 7 === 2 ? 8 : index % 3;
    const last = shift(today, -Math.min(duration, lastOffset));
    const weights: PromoClient["weights"] = [];
    const records: PromoRecord[] = [];
    function record(kind: RecordKind, date: string, suffix: string, payload: Record<string, unknown>, author_type: "coach" | "client" = "client", reviewed = true) {
      records.push({ id: promoId(`client:${index}:${kind}:${suffix}`), kind, entry_date: date, payload, author_type, source_key: `${PROMO_VERSION}:${index}:${kind}:${suffix}`, created_at: timestamp(date), updated_at: timestamp(date),
        reviewed_at: kind === "checkin" && reviewed ? timestamp(date, 18) : null,
        coach_feedback: kind === "checkin" && reviewed ? "شكرًا على التحديث. راجعنا التسجيلات، ونستمر على الخطة مع زيادة الحمل تدريجيًا عند إتمام التكرارات." : "", read_at: kind === "message" && reviewed ? timestamp(date, 18) : null });
    }
    const elapsed = (date: string) => Math.max(0, Math.round((Date.parse(date) - Date.parse(joined)) / 86400000));
    const weightAt = (date: string) => {
      const progress = Math.min(1, elapsed(date) / (successCase ? 182 : Math.max(28, duration)));
      const variation = Math.sin(elapsed(date) * 0.29 + index) * (progress === 0 ? 0 : 0.25);
      return round(startWeight + totalChange * progress + variation);
    };
    const loadAt = (date: string) => Math.round((firstLoad + (successCase && scenario === "muscle_gain" ? 30 : 15) * Math.min(1, elapsed(date) / 210)) / 2.5) * 2.5;
    const content = programFor(index, scenario);
    for (let day = joined, week = 0; day <= last; day = shift(day, 7), week++) {
      if (week > 1 && (week + index) % 13 === 0) continue; // Genuine missing weeks, not artificial zero values.
      const weight = weightAt(day);
      weights.push({ id: promoId(`client:${index}:weight:${week}`), entry_date: day, weight, updated_at: timestamp(day) });
      record("checkin", day, `week:${week}`, { weight, sleep: 3 + (week + index) % 2, energy: 3 + (week + index + 1) % 2, hunger: 2 + week % 3, stress: 2 + (week + index) % 3, training_adherence: 70 + (week * 7 + index) % 26, nutrition_adherence: 72 + (week * 3 + index) % 24, feedback: week % 5 === 2 ? "الأسبوع كان مزدحمًا. اكتملت حصتان، وسأرتب مواعيد النوم بشكل أفضل." : "سجلت الحصص حسب المتاح وحافظت على الوجبات المعتادة.", questions: week % 8 === 3 ? "هل أرفع الحمل في الحصة القادمة بعد إتمام التكرارات؟" : "", photo_ids: [] }, "client", day < shift(today, -3));
      for (let session = 0; session < (week % 6 === 2 ? 2 : 3); session++) {
        const date = shift(day, session * 2);
        if (date > last) continue;
        const training = content.days[(week * 3 + session) % content.days.length];
        const completed = (week + session + index) % 11 !== 0;
        const relativeLoads: Record<string, number> = { Barbell_Squat: 1, "Barbell_Bench_Press_-_Medium_Grip": female.has(index) ? 0.55 : 0.8, Bent_Over_Barbell_Row: 0.7, Romanian_Deadlift: 1.1, Dumbbell_Shoulder_Press: 0.25, "Wide-Grip_Lat_Pulldown": 0.75, Dumbbell_Bicep_Curl: 0.2, Incline_Dumbbell_Press: 0.3, Leg_Press: 1.5, Lying_Leg_Curls: 0.45, Standing_Calf_Raises: 0.5, Triceps_Pushdown: 0.35 };
        record("workout_log", date, `week:${week}:session:${session}`, { day_name: training.name, completed, notes: completed ? "سُجل الأداء الفعلي بعد الإحماء. أوزان الدمبل مسجلة لكل يد." : "حصة جزئية لضيق الوقت؛ يتبقى التمرين الأخير.", exercises: training.exercises.slice(0, completed ? 3 : 2).map(exercise => ({ name: exercise.name, sets: elapsed(date) < 28 ? 2 : 3, reps: "10", weight: Math.max(2.5, Math.round(loadAt(date) * (relativeLoads[exercise.catalogId!] ?? 0.5) / 2.5) * 2.5), rpe: 7 + (week % 2) * 0.5, rir: 2 })) });
      }
      if (week % 2 === 0) record("nutrition_log", day, `week:${week}`, { calories: content.nutrition.calories + ((week + index) % 3 - 1) * 65, protein: content.nutrition.protein - 5 + week % 10, carbs: content.nutrition.carbs - 10 + week % 20, fat: content.nutrition.fat + week % 5, notes: "تسجيل يوم واحد؛ الأيام غير المسجلة لا تمثل صفرًا." });
      if (week % 4 === 0) {
        const reduction = Math.max(0, startWeight - weight);
        record("measurement", day, `week:${week}`, { weight, waist: round((female.has(index) ? 85 : 103) + index % 7 - reduction * 0.9), chest: round((female.has(index) ? 91 : 107) - reduction * 0.3 + (scenario === "muscle_gain" ? elapsed(day) / 120 : 0)), hips: round((female.has(index) ? 103 : 105) - reduction * 0.4), arm: round((female.has(index) ? 28 : 34) + (scenario === "muscle_gain" ? elapsed(day) / 180 : -reduction * 0.06)), thigh: round((female.has(index) ? 57 : 62) - reduction * 0.15), calf: round(35 + index % 4 - reduction * 0.03), notes: "قياسات دورية بالسنتيمتر باستخدام الشريط نفسه." }, week % 12 === 0 ? "coach" : "client");
      }
      if (week % 8 === 2) {
        record("message", day, `week:${week}:question`, { text: "أقدر أبدّل موعد الحصة ليوم غد هذا الأسبوع؟" }, "client");
        record("message", day, `week:${week}:reply`, { text: "نعم، حافظ على يوم راحة مناسب بين الحصص وسجّل الأداء بعد التدريب." }, "coach");
      }
    }
    if (weights.at(-1)?.entry_date !== last) weights.push({ id: promoId(`client:${index}:weight:latest`), entry_date: last, weight: weightAt(last), updated_at: timestamp(last) });
    [0, 1, 2].forEach(phase => {
      const date = shift(joined, phase * 70);
      if (date <= today) {
        record("program_history", date, `phase:${phase}`, { name: ["مرحلة التأسيس", "مرحلة البناء", "مرحلة تطوير الأداء"][phase], content: programFor(index, scenario, phase) }, "coach");
        record("nutrition_target", date, `phase:${phase}`, { ...programFor(index, scenario, phase).nutrition }, "coach");
      }
    });
    record("note", joined, "profile", { text: `${note}\nالمدينة: ${cities[index % cities.length]}. الهدف: ${scenario === "fat_loss" ? "خفض الوزن تدريجيًا" : scenario === "muscle_gain" ? "بناء القوة والعضلات" : "اللياقة والانتظام"}.` }, "coach");
    const currentWeight = weights.at(-1)!.weight;
    return { id: promoId(`client:${index}`), name, email: `easycoach-promo-${String(index + 1).padStart(2, "0")}@example.test`, phone: `050000${String(4001 + index).padStart(4, "0")}`, city: cities[index % cities.length], joined,
      details: { age: 22 + index * 7 % 29, gender: female.has(index) ? "female" : "male", height, start_date: joined, status: inactive ? "inactive" : duration < 14 ? "new" : "active" },
      goal: { goal: [7, 12].includes(index) ? "الاستعداد لبطولة قوة محلية بإشراف المدرب" : scenario === "fat_loss" ? "خفض الوزن تدريجيًا وتحسين الانتظام" : scenario === "muscle_gain" ? "زيادة القوة وبناء الكتلة العضلية" : scenario === "plateau" ? "مراجعة الاستمرارية وتجاوز ثبات القياس" : "تحسين اللياقة والعادات اليومية", target_weight: round(startWeight + totalChange), focus: scenario === "muscle_gain" ? "تدرج الحمل وجودة الحركة" : "الاستمرارية والمتابعة الأسبوعية", notes: note },
      successCase, accountRequested: index < 5, scenario, program: { id: promoId(`client:${index}:published`), name: ["كامل الجسم · 3 أيام", "علوي وسفلي · 4 أيام", "دفع وسحب وأرجل · 3 أيام"][index % 3], content, created_at: timestamp(joined), published_at: timestamp(shift(today, -Math.min(21, duration))) },
      weights, records: records.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id.localeCompare(b.id)), subscriptions: subscriptionsFor(index, joined, today, inactive), schedule: { weight_days: index % 3 === 0 ? 3 : 7, measurement_days: index % 4 === 0 ? 14 : 30, photo_days: 30 },
      outcome: { startWeight, currentWeight, weightChange: round(currentWeight - startWeight), firstLoad, currentLoad: loadAt(last) },
    };
  });
  const statusSummary = {
    active: clients.filter(client => client.details.status === "active").length,
    inactive: clients.filter(client => client.details.status === "inactive").length,
    new: clients.filter(client => client.details.status === "new").length,
    expired: clients.filter(client => client.subscriptions.at(-1)!.end_date < today).length,
    nearExpiry: clients.filter(client => { const end = client.subscriptions.at(-1)!.end_date; return end >= today && end <= shift(today, 7); }).length,
    frozenNow: clients.filter(client => client.subscriptions.some(subscription => subscription.freezes.some(freeze => freeze.start_date <= today && freeze.end_date >= today))).length,
    acquisitionByMonth: Object.fromEntries([...new Set(clients.map(client => client.joined.slice(0, 7)))].sort().map(month => [month, clients.filter(client => client.joined.startsWith(month)).length])),
  };
  return { version: PROMO_VERSION, synthetic: true as const, today, clients, statusSummary,
    summary: { trainees: clients.length, successCases: clients.filter(client => client.successCase).length, accountsRequested: clients.filter(client => client.accountRequested).length, female: clients.filter(client => client.details.gender === "female").length, cities: new Set(clients.map(client => client.city)).size, joinedFrom: clients[0].joined, joinedThrough: clients.at(-1)!.joined, weights: clients.reduce((sum, client) => sum + client.weights.length, 0), records: clients.reduce((sum, client) => sum + client.records.length, 0), subscriptions: clients.reduce((sum, client) => sum + client.subscriptions.length, 0), payments: clients.reduce((sum, client) => sum + client.subscriptions.reduce((count, row) => count + row.payments.length, 0), 0), receivedSar: clients.reduce((sum, client) => sum + client.subscriptions.reduce((amount, row) => amount + row.payments.reduce((total, payment) => total + payment.amount, 0), 0), 0), freezeCount: clients.reduce((sum, client) => sum + client.subscriptions.reduce((count, row) => count + row.freezes.length, 0), 0) } };
}
