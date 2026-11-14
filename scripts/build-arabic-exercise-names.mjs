/**
 * Rebuilds lib/exercise-data/ar.json from the English catalogue.
 *
 * The previous Arabic names were machine-translated word by word, which turned
 * "Bench Press" into «اضغط على مقاعد البدلاء» (press on the substitutes' bench),
 * "Curl" into «تجعيد الشعر» (hair curling), "Clean and Jerk" into «نظيفة ورعشة»
 * and "Snatch" into «خطف» (abduction). Word order was lost too, so no
 * find-and-replace over the Arabic could recover them.
 *
 * This composes each name instead, from a reviewed gym-Arabic lexicon, in the
 * order Arabic actually uses: movement, then equipment, then modifiers —
 * «ضغط بنش بالبار مائل». Terminology is unified: squat is always «سكوات»,
 * never «قرفصاء».
 *
 * Anything the lexicon cannot account for keeps its English name rather than
 * inventing Arabic, and is listed in the report so a human can finish it. The
 * English name stays visible in the interface either way.
 *
 *   node scripts/build-arabic-exercise-names.mjs            # report only
 *   node scripts/build-arabic-exercise-names.mjs --write    # rewrite ar.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../lib/exercise-data/", import.meta.url);
const catalogue = JSON.parse(readFileSync(new URL("exercises.json", root), "utf8"));

/** Whole names that a composer would only mangle. Reviewed by hand. */
const exact = {
  "90_90_Hamstring": "إطالة خلفية الفخذ بزاوية 90 درجة",
  Adductor: "إطالة الفخذ الداخلي بالفوم رول",
  Adductor_Groin: "إطالة الفخذ الداخلي",
  Alternate_Heel_Touchers: "لمس الكعبين بالتبادل",
  Ankle_On_The_Knee: "إطالة المؤخرة بوضع الكاحل على الركبة",
  Around_The_Worlds: "دوران الدمبل حول الجسم",
  "Bent_Over_Low-Pulley_Side_Lateral": "رفرفة جانبية بالكابل مع انحناء الجذع",
  Bicycling: "ركوب الدراجة",
  Bicycling_Stationary: "الدراجة الثابتة",
  "Body-Up": "رفع الجسم بالارتكاز على الساعدين",
  Bottoms_Up: "رفع الحوض مع مد الرجلين",
  "Butt-Ups": "رفع الحوض من البلانك",
  Cable_Iron_Cross: "فتح الذراعين بالكابل",
  Car_Drivers: "تدوير قرص الوزن أمام الجسم",
  Chest_Push_multiple_response: "دفع الكرة الطبية من الصدر بتكرار متواصل",
  Chest_Push_single_response: "دفع الكرة الطبية من الصدر مرة واحدة",
  Childs_Pose: "وضعية الطفل",
  Circus_Bell: "رفع دمبل السيرك بذراع واحدة",
  Cocoons: "ضم الركبتين والجذع للبطن",
  Conans_Wheel: "حمل عجلة كونان",
  "Cross_Over_-_With_Bands": "تجميع الصدر بالمطاط",
  Crucifix: "ثبات الذراعين جانبًا بالأوزان",
  Downward_Facing_Balance: "توازن بوضعية الكلب المتجه للأسفل",
  Drop_Push: "ضغط انفجاري من السقوط",
  Dumbbell_Lying_Pronation: "تدوير الساعد بالدمبل للداخل مع الاستلقاء",
  Dumbbell_Lying_Supination: "تدوير الساعد بالدمبل للخارج مع الاستلقاء",
  Dumbbell_Scaption: "رفع الدمبل قطريًا للأكتاف",
  Elbow_to_Knee: "لمس الركبة بالكوع",
  Elbows_Back: "سحب المرفقين للخلف",
  Elliptical_Trainer: "جهاز الإليبتيكال",
  Fast_Skipping: "وثب متبادل سريع",
  Frog_Hops: "قفز الضفدع",
  Front_Cone_Hops_or_hurdle_hops: "قفز أمامي فوق الحواجز",
  Gironda_Sternum_Chins: "عقلة جيروندا إلى الصدر",
  Groiners: "إطالة الفخذ بوضعية الاندفاع",
  Hanging_Pike: "رفع الرجلين مستقيمتين من التعلق",
  Heavy_Bag_Thrust: "دفع الكيس الثقيل",
  Hug_A_Ball: "إطالة الظهر باحتضان الكرة",
  Hug_Knees_To_Chest: "ضم الركبتين إلى الصدر",
  Hurdle_Hops: "قفز الحواجز",
  Hyperextensions_With_No_Hyperextension_Bench: "تمديد الظهر دون مقعد",
  Inchworm: "المشي باليدين إلى البلانك",
  Incline_Cable_Flye: "تفتيح صدر بالكابل على مقعد مائل",
  Incline_Dumbbell_Bench_With_Palms_Facing_In: "ضغط بنش مائل بالدمبل بقبضة محايدة",
  Iron_Cross: "ثبات الذراعين جانبًا",
  Isometric_Chest_Squeezes: "ضغط ثابت للصدر",
  "Isometric_Neck_Exercise_-_Front_And_Back": "مقاومة ثابتة للرقبة أمامًا وخلفًا",
  "Isometric_Neck_Exercise_-_Sides": "مقاومة ثابتة للرقبة جانبًا",
  Jogging_Treadmill: "هرولة على السير",
  Keg_Load: "رفع البرميل إلى المنصة",
  Kettlebell_Figure_8: "تمرير الكيتل بل بشكل 8",
  Kettlebell_Pirate_Ships: "تأرجح الكيتل بل قطريًا",
  Kipping_Muscle_Up: "ماسل أب بالتأرجح",
  Knee_Across_The_Body: "إطالة الركبة عبر الجسم",
  Kneeling_Arm_Drill: "تدريب حركة الذراعين من الركوع",
  Kneeling_Hip_Flexor: "إطالة مثنيات الورك من الركوع",
  Landmine_180s: "دوران لاندماين 180 درجة",
  Landmine_Linear_Jammer: "دفع لاندماين أمامي",
  Lateral_Cone_Hops: "قفز جانبي فوق الأقماع",
  "Linear_3-Part_Start_Technique": "تدريب انطلاق العدو بثلاث مراحل",
  Linear_Acceleration_Wall_Drill: "تدريب التسارع بالارتكاز على الحائط",
  Looking_At_Ceiling: "إطالة الرقبة بالنظر للأعلى",
  Lying_Bent_Leg_Groin: "إطالة الفخذ الداخلي مستلقيًا مع ثني الرجلين",
  Lying_Face_Down_Plate_Neck_Resistance: "مقاومة الرقبة بقرص الوزن مستلقيًا على البطن",
  Lying_Face_Up_Plate_Neck_Resistance: "مقاومة الرقبة بقرص الوزن مستلقيًا على الظهر",
  Lying_Glute: "إطالة المؤخرة مستلقيًا",
  Lying_Hamstring: "إطالة خلفية الفخذ مستلقيًا",
  Lying_Prone_Quadriceps: "إطالة أمامية الفخذ مستلقيًا على البطن",
  Mixed_Grip_Chin: "عقلة بقبضة مختلطة",
  Monster_Walk: "مشي جانبي بالمطاط",
  Moving_Claw_Series: "سلسلة خطوات المخلب للإحماء",
  Muscle_Up: "ماسل أب",
  "One-Arm_Flat_Bench_Dumbbell_Flye": "تفتيح صدر بالدمبل بذراع واحدة على مقعد مستوٍ",
  "One-Arm_Medicine_Ball_Slam": "ضرب الكرة الطبية بالأرض بذراع واحدة",
  "One-Arm_Side_Laterals": "رفرفة جانبية بذراع واحدة",
  One_Arm_Against_Wall: "إطالة الكتف بذراع على الحائط",
  One_Half_Locust: "وضعية نصف الجرادة",
  One_Handed_Hang: "تعلق بيد واحدة",
  One_Knee_To_Chest: "ضم ركبة واحدة إلى الصدر",
  "Otis-Up": "أوتيس أب للبطن",
  Overhead_Lat: "إطالة الظهر العريض فوق الرأس",
  Overhead_Slam: "ضرب الكرة الطبية بالأرض من فوق الرأس",
  Overhead_Triceps: "إطالة الترايسبس فوق الرأس",
  Plate_Pinch: "مسك أقراص الوزن بالأصابع",
  Platform_Hamstring_Slides: "سحب الكعبين على منصة لخلفية الفخذ",
  Power_Partials: "رفرفة جانبية جزئية بالدمبل",
  Power_Stairs: "صعود الدرج بالأوزان",
  Prone_Manual_Hamstring: "ثني خلفية الفخذ بمقاومة شريك مستلقيًا",
  Pyramid: "إطالة بوضعية الهرم",
  Quick_Leap: "قفزة سريعة",
  Rack_Delivery: "نقل البار إلى وضعية الراك",
  Reverse_Hyperextension: "تمديد الظهر العكسي",
  Running_Treadmill: "جري على السير",
  Sandbag_Load: "رفع كيس الرمل إلى المنصة",
  Seated_Biceps: "إطالة البايسبس جالسًا",
  Seated_Front_Deltoid: "إطالة الكتف الأمامي جالسًا",
  Seated_Glute: "إطالة المؤخرة جالسًا",
  Seated_Hamstring: "إطالة خلفية الفخذ جالسًا",
  Seated_Head_Harness_Neck_Resistance: "مقاومة الرقبة بحزام الرأس جالسًا",
  Seated_Leg_Tucks: "ضم الركبتين للبطن جالسًا",
  Side_Jackknife: "كرنش جانبي مع رفع الرجلين",
  Side_To_Side_Chins: "عقلة بالتبادل بين الجانبين",
  "Single-Arm_Linear_Jammer": "دفع لاندماين أمامي بذراع واحدة",
  "Single-Leg_Hop_Progression": "تدرج القفز برجل واحدة",
  "Single-Leg_Lateral_Hop": "قفز جانبي برجل واحدة",
  "Single_Leg_Push-off": "دفع وقفز برجل واحدة من المقعد",
  Skating: "تزلج",
  Sled_Overhead_Backward_Walk: "سحب الزلاجة للخلف والذراعان فوق الرأس",
  Sled_Push: "دفع الزلاجة",
  Sled_Reverse_Flye: "رفرفة خلفية بسحب الزلاجة",
  Speed_Band_Overhead_Triceps: "تمديد الترايسبس بالمطاط فوق الرأس بسرعة",
  Spell_Caster: "تدوير الدمبل قطريًا للجذع",
  Stairmaster: "جهاز صعود الدرج",
  Standing_Hip_Flexors: "إطالة مثنيات الورك واقفًا",
  Standing_Olympic_Plate_Hand_Squeeze: "ضغط قرص الوزن باليدين واقفًا",
  Standing_Pelvic_Tilt: "إمالة الحوض واقفًا",
  Stomach_Vacuum: "شفط البطن",
  Suspended_Fallout: "مد الجسم بأشرطة التعليق",
  The_Straddle: "إطالة الرجلين بوضعية الفتح",
  Thigh_Abductor: "فتح الفخذين على الجهاز",
  Thigh_Adductor: "ضم الفخذين على الجهاز",
  Toe_Touchers: "لمس أصابع القدمين",
  "Upper_Back-Leg_Grab": "إطالة أعلى الظهر مع إمساك الرجل",
  Weighted_Ball_Hyperextension: "تمديد الظهر على الكرة مع وزن",
  Yoke_Walk: "مشي بحمل اليوك",
  Barbell_Squat: "سكوات بالبار",
  Front_Barbell_Squat: "سكوات أمامي بالبار",
  Barbell_Hack_Squat: "سكوات هاك بالبار",
  Bodyweight_Squat: "سكوات بوزن الجسم",
  Goblet_Squat: "سكوات جوبلت",
  Frankenstein_Squat: "سكوات فرانكشتاين",
  Dumbbell_Squat_To_A_Bench: "سكوات دمبل إلى مقعد",
  Chair_Squat: "سكوات على الكرسي",
  Overhead_Squat: "سكوات مع رفع البار فوق الرأس",
  Barbell_Full_Squat: "سكوات كامل بالبار",
  Split_Squat_with_Dumbbells: "سكوات مقسّم بالدمبل",
  Bulgarian_Split_Squat: "سكوات بلغاري",
  Clean_and_Jerk: "كلين آند جيرك",
  Clean_and_Press: "كلين آند بريس",
  Power_Clean: "باور كلين",
  Hang_Clean: "هانغ كلين",
  Hang_Snatch: "هانغ سناتش",
  Snatch_Deadlift: "ديدلفت سناتش",
  Muscle_Snatch: "سناتش بالعضلات",
  Barbell_Deadlift: "ديدلفت بالبار",
  Romanian_Deadlift: "ديدلفت روماني",
  Sumo_Deadlift: "ديدلفت سومو",
  Rack_Pulls: "سحب من الراك",
  "Barbell_Bench_Press_-_Medium_Grip": "ضغط بنش بالبار — قبضة متوسطة",
  "Bench_Press_-_Powerlifting": "ضغط بنش — رفع أثقال",
  Dumbbell_Bench_Press: "ضغط بنش بالدمبل",
  Incline_Dumbbell_Press: "ضغط بنش مائل بالدمبل",
  Decline_Dumbbell_Bench_Press: "ضغط بنش مائل سفلي بالدمبل",
  Pushups: "تمرين الضغط",
  Pullups: "عقلة",
  "Chin-Up": "عقلة بقبضة عكسية",
  "Dips_-_Triceps_Version": "متوازي للترايسبس",
  Plank: "بلانك",
  Side_Plank: "بلانك جانبي",
  Crunches: "كرنش",
  Hip_Thrust: "دفع الحوض",
  Face_Pull: "سحب الوجه",
  "Turkish_Get-Up_Lunge_style": "القيام التركي بالكيتل بل — بالاندفاع",
  "Kettlebell_Turkish_Get-Up_Lunge_style": "القيام التركي بالكيتل بل — بالاندفاع",
  "Kettlebell_Turkish_Get-Up_Sit-up_style": "القيام التركي بالكيتل بل — بالجلوس",
  Hammer_Curls: "كيرل هامر بالدمبل",
  Triceps_Pushdown: "ترايسبس كيبل",
  Standing_Calf_Raises: "رفع السمانة واقفًا",
  "Walking,_Treadmill": "مشي على السير",
};

/** Movement cores, longest phrase first. */
const movements = [
  ["bench press", "ضغط بنش"],
  ["chest press", "ضغط صدر"],
  ["shoulder press", "ضغط كتف"],
  ["military press", "ضغط عسكري"],
  ["overhead press", "ضغط فوق الرأس"],
  ["push press", "ضغط بدفع"],
  ["floor press", "ضغط أرضي"],
  ["leg press", "ضغط أرجل"],
  ["calf press", "ضغط سمانة"],
  ["push-up", "تمرين الضغط"],
  ["pushup", "تمرين الضغط"],
  ["push up", "تمرين الضغط"],
  ["pull-up", "عقلة"],
  ["pullup", "عقلة"],
  ["pull up", "عقلة"],
  ["chin-up", "عقلة بقبضة عكسية"],
  ["chin up", "عقلة بقبضة عكسية"],
  ["pulldown", "سحب أمامي"],
  ["pull down", "سحب أمامي"],
  ["lat pulldown", "سحب أمامي للظهر"],
  ["deadlift", "ديدلفت"],
  ["good morning", "غود مورنينغ"],
  ["squat", "سكوات"],
  ["lunge", "اندفاع"],
  ["step-up", "صعود على صندوق"],
  ["step up", "صعود على صندوق"],
  ["hip thrust", "دفع الحوض"],
  ["glute bridge", "جسر المؤخرة"],
  ["leg curl", "تمرين الخلفية"],
  ["leg extension", "تمديد الأرجل"],
  ["leg raise", "رفع الأرجل"],
  ["calf raise", "رفع السمانة"],
  ["lateral raise", "رفرفة جانبية"],
  ["side lateral raise", "رفرفة جانبية"],
  ["front raise", "رفرفة أمامية"],
  ["rear delt raise", "رفرفة خلفية"],
  ["rear delt fly", "رفرفة خلفية"],
  ["reverse fly", "رفرفة خلفية"],
  ["chest fly", "تفتيح صدر"],
  ["fly", "تفتيح"],
  ["flyes", "تفتيح"],
  ["upright row", "سحب عمودي"],
  ["bent over row", "تجديف بانحناء"],
  ["bent-over row", "تجديف بانحناء"],
  ["row", "تجديف"],
  ["shrug", "رفع أكتاف"],
  ["skullcrusher", "سكل كراشر"],
  ["skull crusher", "سكل كراشر"],
  ["triceps extension", "تمديد ترايسبس"],
  ["tricep extension", "تمديد ترايسبس"],
  ["triceps pushdown", "ترايسبس كيبل"],
  ["pushdown", "ترايسبس كيبل"],
  ["kickback", "كيك باك ترايسبس"],
  ["curl", "كيرل"],
  ["crunch", "كرنش"],
  ["sit-up", "تمرين البطن"],
  ["situp", "تمرين البطن"],
  ["sit up", "تمرين البطن"],
  ["plank", "بلانك"],
  ["russian twist", "تويست روسي"],
  ["dip", "متوازي"],
  ["dips", "متوازي"],
  ["clean", "كلين"],
  ["jerk", "جيرك"],
  ["snatch", "سناتش"],
  ["thruster", "ثراستر"],
  ["swing", "سوينغ"],
  ["carry", "حمل"],
  ["farmer's walk", "مشية الفلاح"],
  ["get-up", "القيام"],
  ["sprint", "سبرنت"],
  ["run", "جري"],
  ["walking", "مشي"],
  ["jump", "نط"],
  ["stretch", "تمدد"],
  ["smr", "تحرير عضلي SMR"],
  ["pass", "تمرير"],
  ["throw", "رمي"],
  ["hold", "ثبات"],
  ["rollout", "رول أوت للبطن"],
  ["roller", "رولر للبطن"],
  ["side bend", "ميل جانبي"],
  ["pullover", "بُل أوفر"],
  ["crossover", "كروس أوفر"],
  ["crawl", "زحف"],
  ["drag", "جرّ"],
  ["bound", "قفز متتابع"],
  ["skip", "نطّ"],
  ["circle", "تدوير"],
  ["cycling", "دراجة"],
  ["bike", "دراجة"],
  ["butterfly", "بترفلاي للصدر"],
  ["adduction", "تقريب الفخذ"],
  ["abduction", "تبعيد الفخذ"],
  ["windmill", "ويندميل"],
  ["flip", "قلب"],
  ["stance", "وقفة"],
  ["mountain climber", "ماونتن كلايمر"],
  ["burpee", "بيربي"],
  ["wall slide", "انزلاق على الحائط"],
  ["heel touch", "لمس الكعب"],
  ["toe touch", "لمس أطراف القدم"],
  ["scissor", "مقص"],
  ["flutter", "رفرفة الأرجل"],
  ["superman", "سوبرمان"],
  ["bird dog", "بيرد دوغ"],
  ["dead bug", "ديد باغ"],
  ["chop", "قطع بالكابل"],
  ["halo", "هالو بالكيتل بل"],
  ["wiper", "مسّاحة"],
  ["raise", "رفع"],
  ["extension", "تمديد"],
  ["flexion", "ثني"],
  ["bend", "ميل"],
  ["step", "خطوة"],
  ["kick", "ركل"],
  ["march", "مشي بالمكان"],
  ["shuffle", "تنقل جانبي"],
  ["sprawl", "سبراول"],
  ["climb", "تسلق"],
  ["lift", "رفعة"],
  ["clap", "تصفيق"],
  ["stone", "حجر أطلس"],
  ["rope", "حبل"],
  ["board", "لوح توازن"],
  ["press", "ضغط"],
  ["pull", "سحب"],
  ["twist", "لف"],
  ["rotation", "تدوير"],
  ["bridge", "جسر"],
];

/** Equipment, written the way it is said in a gym. */
const equipment = [
  ["barbell", "بالبار"],
  ["ez-bar", "ببار EZ"],
  ["ez bar", "ببار EZ"],
  ["dumbbell", "بالدمبل"],
  ["kettlebell", "بالكيتل بل"],
  ["cable", "بالكابل"],
  ["smith machine", "بجهاز سميث"],
  ["smith", "بجهاز سميث"],
  ["machine", "بالجهاز"],
  ["band", "بالمطاط"],
  ["bands", "بالمطاط"],
  ["medicine ball", "بالكرة الطبية"],
  ["exercise ball", "بكرة التمارين"],
  ["stability ball", "بكرة التوازن"],
  ["bosu ball", "بكرة بوسو"],
  ["ball", "بالكرة"],
  ["bodyweight", "بوزن الجسم"],
  ["body weight", "بوزن الجسم"],
  ["weighted", "بوزن إضافي"],
  ["sled", "بالزحافة"],
  ["trap bar", "ببار تراب"],
  ["landmine", "بلاند ماين"],
  ["rope attachment", "بالحبل"],
  ["rope", "بالحبل"],
  ["foam roll", "بالفوم رول"],
  ["treadmill", "على السير"],
  ["bike", "على الدراجة"],
];

/** Modifiers, appended after the equipment. */
const modifiers = [
  ["incline", "مائل"],
  ["decline", "مائل سفلي"],
  ["seated", "جالس"],
  ["standing", "واقف"],
  ["lying", "مستلقي"],
  ["prone", "على البطن"],
  ["kneeling", "راكع"],
  ["single-arm", "بذراع واحدة"],
  ["one-arm", "بذراع واحدة"],
  ["one arm", "بذراع واحدة"],
  ["single-leg", "برجل واحدة"],
  ["one-leg", "برجل واحدة"],
  ["single leg", "برجل واحدة"],
  ["alternating", "بالتبديل"],
  ["close-grip", "بقبضة ضيقة"],
  ["close grip", "بقبضة ضيقة"],
  ["wide-grip", "بقبضة واسعة"],
  ["wide grip", "بقبضة واسعة"],
  ["neutral grip", "بقبضة محايدة"],
  ["reverse grip", "بقبضة عكسية"],
  ["hammer grip", "بقبضة هامر"],
  ["hammer", "هامر"],
  ["underhand", "بقبضة سفلية"],
  ["overhand", "بقبضة علوية"],
  ["reverse", "عكسي"],
  ["behind the neck", "خلف الرقبة"],
  ["behind neck", "خلف الرقبة"],
  ["overhead", "فوق الرأس"],
  ["front", "أمامي"],
  ["side", "جانبي"],
  ["lateral", "جانبي"],
  ["rear", "خلفي"],
  ["bent over", "بانحناء"],
  ["bent-over", "بانحناء"],
  ["wall", "على الحائط"],
  ["floor", "أرضي"],
  ["hanging", "بالتعليق"],
  ["jumping", "بالنط"],
  ["isometric", "ثابت"],
  ["partial", "جزئي"],
  ["full", "كامل"],
  ["high", "عالي"],
  ["low", "منخفض"],
  ["wide", "واسع"],
  ["narrow", "ضيق"],
  ["sumo", "سومو"],
  ["romanian", "روماني"],
  ["bulgarian", "بلغاري"],
  ["zercher", "زيرشر"],
  ["paused", "بوقفة"],
  ["explosive", "متفجر"],
  ["slow", "بطيء"],
];

const muscleWords = [
  ["triceps", "ترايسبس"],
  ["biceps", "بايسبس"],
  ["brachialis", "العضدية"],
  ["quadriceps", "الفخذ الأمامي"],
  ["hamstring", "أوتار الركبة"],
  ["glute", "المؤخرة"],
  ["calf", "السمانة"],
  ["calves", "السمانة"],
  ["abdominal", "البطن"],
  ["abs", "البطن"],
  ["oblique", "الخصر الجانبي"],
  ["lats", "الظهر العريض"],
  ["chest", "الصدر"],
  ["shoulder", "الكتف"],
  ["trap", "الترابيس"],
  ["forearm", "الساعد"],
  ["neck", "الرقبة"],
  ["adductor", "الضامة"],
  ["abductor", "المبعدة"],
  ["tibialis", "الظنبوبي"],
  ["iliotibial", "الحرقفي الظنبوبي"],
  ["groin", "أعلى الفخذ الداخلي"],
  ["hip", "الحوض"],
  ["back", "الظهر"],
];

const english = (id, name) => (name ?? id.replace(/_/g, " ")).toLowerCase();
// A plural or a gerund is the same movement: "Curls" and "Curling" are a curl.
const match = (text, table) =>
  table.find(([term]) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z])" + escaped + "(s|es|ing)?($|[^a-z])").test(text);
  });

function compose(exercise) {
  if (exact[exercise.id]) return { name: exact[exercise.id], source: "reviewed" };
  const text = english(exercise.id, exercise.name);
  const movement = match(text, movements);
  if (!movement) return { name: exercise.name, source: "untranslated" };

  // Each term that matches is consumed, so "Wide-Grip Lat Pulldown" does not
  // also match the bare "wide" and come out as «بقبضة واسعة واسع».
  let rest = text;
  const take = (term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rest = rest.replace(new RegExp("(^|[^a-z])" + escaped + "(s|es|ing)?($|[^a-z])", "g"), " ");
  };

  const parts = [movement[1]];
  take(movement[0]);
  // "Triceps Extension" already carries its muscle inside the movement term.
  const muscle = match(rest, muscleWords);
  if (muscle && !movement[1].includes(muscle[1])) {
    parts.push(muscle[1]);
    take(muscle[0]);
  }
  const tool = match(rest, equipment);
  // Some movements name their own tool («هالو بالكيتل بل»); do not say it twice.
  if (tool && !movement[1].includes(tool[1])) {
    parts.push(tool[1]);
    take(tool[0]);
  }
  for (const [term, arabic] of modifiers)
    if (match(rest, [[term, arabic]]) && !parts.some((part) => part.includes(arabic) || arabic.includes(part) || part.slice(0, 4) === arabic.slice(0, 4))) {
      parts.push(arabic);
      take(term);
    }

  return { name: parts.join(" ").replace(/\s+/g, " ").trim(), source: "composed" };
}

const built = {};
const report = { reviewed: 0, composed: 0, untranslated: [] };
for (const exercise of catalogue) {
  const { name, source } = compose(exercise);
  built[exercise.id] = { name };
  if (source === "untranslated") report.untranslated.push(exercise.id);
  else report[source]++;
}

const write = process.argv.includes("--write");
if (write) {
  writeFileSync(new URL("ar.json", root), JSON.stringify(built, null, 1) + "\n");
}
console.log(
  [
    (write ? "wrote" : "would write") + " " + Object.keys(built).length + " names",
    "  reviewed by hand: " + report.reviewed,
    "  composed from the lexicon: " + report.composed,
    "  left in English for review: " + report.untranslated.length,
    report.untranslated.length ? "  " + report.untranslated.slice(0, 40).join(", ") : "",
  ].join("\n"),
);
