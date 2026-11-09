# صور التمارين — 9 نوفمبر 2026

طلب المالك مجسمات بيضاء لكل التمارين، ثم اختار صور رجال إذا لم يتوفر حل يغطي المكتبة كلها. لم تثبت مطابقة كاملة للمجسمات الـ876 من مصدر مجاني مرخص؛ لم يتم شراء حزمة أو استبدال التمارين بحركات مشابهة.

## التطبيق

- `ExerciseVisual` مكوّن مشترك بين المكتبة ومحرر البرامج وعرض برنامج المتدرب. يعرض صورًا ثابتة لرجال لكل معرف تمرين معتمد، بما فيها العقلة وتفتيح الدمبل؛ لا يخلط صور المجسمات مع الصور الثابتة.
- تمت معاينة الصور الـ876 على 13 لوحة مراجعة محلية، ثم تكبير الصور الملتبسة. لم تظهر صور نساء في الصور التي تمت مراجعتها. هذه مراجعة للمظهر في الملفات، وليست تحديدًا لهوية الأشخاص.
- 873 صورة من free-exercise-db، بترخيص Unlicense، بقيت كما هي.
- كانت صور الحركات الثلاث أدناه ملفات بيضاء بحجم 188 بايت رغم نجاح تحميلها. استُبدلت بصور مولّدة باستخدام أداة توليد الصور المدمجة، دون API إضافي. تم فحص الصور بصريًا ومقارنتها بمراحل الحركة في التعليمات. ليست مراجعة طبية أو اعتمادًا من مدرب مختص.
- الصور الجديدة محفوظة فعليًا في `public/exercises/` بصيغة WebP. البصمات في `lib/exercise-data/reviewed-photos.json` تشمل جميع الملفات الـ876. أي صورة جديدة تحتاج مراجعة وإضافة صريحة؛ أي تغيير في الملفات المعتمدة يفشل اختبار البصمات.
- صور الأشخاص لا تُوصَف في النص البديل بأنها مجسمات تشريحية. مقاطع MoveKit الخاصة تبقى مرخصة ومحميّة كما كانت.

## الصور المولّدة والبرومبتات

أداة التنفيذ: built-in image generation. النص المشترك النهائي لكل برومبت:

> Create a photorealistic educational exercise demonstration asset for EasyCoach exercise library. Landscape composition, neutral uncluttered gym, plain charcoal athletic T-shirt, black shorts, male adult fitness instructor only, no women or background bystanders. Full body visible including shoes and all equipment. Crisp realistic photography, natural gym lighting. Correct realistic anatomy, two arms and two hands per person, five fingers, weight not floating, no text, arrows, watermark or logos. Movement: [النص الخاص أدناه] The picture must depict that exact movement and equipment, not a generic fitness pose.

`public/exercises/Kettlebell_Halo.webp`:

> kettlebell halo only. Show the mid-circle position with a single kettlebell close behind the man's head, both elbows bent, hands gripping the horns of the same inverted kettlebell. Upper arms raised, no overhead pressing. Torso upright, ribs down, feet hip-width.

`public/exercises/Kettlebell_Halo_With_Overhead_Extension.webp`:

> kettlebell halo with overhead triceps extension. A clean three-panel sequential exercise photograph in ONE asset: left, same man holds the inverted kettlebell by both horns at upper chest; center, halo brings same bell behind head, elbows bent upward; right, elbows extended to lift bell directly overhead. All three panels show the SAME ADULT MAN performing distinct phases. Anatomically correct hands gripping both horns. No additional people.

`public/exercises/Kettlebell_Overhead_Triceps_Extension.webp`:

> standing two-handed kettlebell overhead triceps extension. A clean TWO-panel sequential exercise photograph in ONE asset: left, elbows flexed and pointing upward, kettlebell hanging behind upper back, both hands grip horns and upper arms close to ears; right, elbows straight overhead and kettlebell hanging behind hands. SAME ADULT MAN in both panels. Full body, spine neutral, feet hip-width, no squat.

## التحقق

اختبار الكتالوج يفحص العرض الصادر عن المكوّن لكل تمرين، وتغطية المعرفات، وبصمات الصور، وقابلية فك ملفاتها، ويرفض الصور ذات التباين المنخفض التي تخفي مشكلة الملف الأبيض. حفظ أدلة المتصفح المحلي في `.local-dev/photo-audit/`؛ لا تعني هذه الأدلة أن التغيير منشور على الإنتاج.

نتائج التنفيذ الفعلي:

- `npm test`: نجح 72 اختبارًا في 6 ملفات، بينها اختبار فك الصور الـ876 وفحص بصماتها وتباينها.
- `npm run typecheck`: ناجح. فحص ESLint للملفات البرمجية الثلاثة المعدلة: ناجح.
- بناء Next.js للإنتاج في مجلد اختبار مستقل: ناجح.
- متصفح Edge/Playwright بحساب مدرب وهمي وقاعدة محلية معزولة: تحميل وفك الصور الـ876 عبر 37 صفحة، دون صور مفقودة أو معرف مكرر. الدليل: `.local-dev/photo-audit/browser-proof.json`.
- تمت معاينة `halo-replacements.png` و`library-mobile.png`، وتظهر الصور الجديدة فعلًا داخل بطاقات المكتبة على الكمبيوتر والجوال. الصور الأصلية وبيانات العملاء البعيدة لم تُعدّل.
