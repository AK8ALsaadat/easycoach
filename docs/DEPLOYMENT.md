# الاستضافة والمصادقة

Vercel: مشروع `easycoach` الموجود مسبقًا والمرتبط بـ`AK8ALsaadat/easycoach`. النطاق: `https://easycoach-livid.vercel.app`. إعداد Vercel Authentication هو `all` لجميع النشرات، بما فيها الإنتاج. لا تُضف نطاقًا عامًا ولا تُعطّل الحماية قبل مراجعة المنتج وسياسة البيانات.

Supabase: `https://trlgsugychocgwtnmzej.supabase.co`، منطقة لندن. القاعدة منفصلة عن بقية مشاريع المستخدم. جميع البيانات المضافة للفحص اصطناعية.

## المتغيرات (Production / Preview / Development)

| المتغير | الاستخدام |
|---|---|
| `APP_URL` | النطاق الموثوق للروابط والرجوع؛ حاليًا `https://easycoach-livid.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | رابط المشروع؛ عام |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام المفضّل |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح anon للتوافق؛ لا صلاحيات إدارية |
| `SUPABASE_SERVICE_ROLE_KEY` | مطلوب على الخادم لتوقيع الصور الخاصة وتنظيف الملفات وتحديد محاولات فتح الروابط؛ لا يُرسل للمتصفح ولا يحل محل سياسات الوصول لسجلات المتدربين |
| `DATABASE_URL` | اختياري لأدوات SQL المباشرة؛ التطبيق يستخدم HTTP ولا يحتاجه. صيغة transaction pooler: `postgresql://postgres.trlgsugychocgwtnmzej:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`. تحقق من عنوان Connect الفعلي في المشروع. لم تُخترع أو تُغيّر كلمة مرور القاعدة. |

كل ملفات `.env*` مستثناة من Git عدا `.env.example`. مجلد `.vercel` وملفات حسابات المراجعة الخاصة مستثناة من Git ومن رفع الاستضافة. لا تُرسل مفاتيح service role أو كلمة مرور القاعدة في المحادثة أو المتصفح.

## Supabase Auth — الإعدادات المضبوطة

Site URL:

```
https://easycoach-livid.vercel.app
```

Redirect URLs:

```
http://localhost:3000/auth/callback
http://localhost:3200/auth/callback
http://127.0.0.1:3200/auth/callback
https://easycoach-livid.vercel.app/auth/callback
https://easycoach-*-ak8alsaadats-projects.vercel.app/auth/callback
```

تأكيد الإيميل مفعّل، والحد الأدنى لكلمة المرور 12 حرفًا. لم تُرسل رسائل تحقق أثناء الاختبار؛ حسابات المراجعة اصطناعية جُهزت إداريًا للاختبار فقط. رابط الدخول السحري لا يرسل شيئًا إلا بطلب المستخدم نفسه.

مصادر التطبيق: `lib/supabase/{client,server,admin}.ts` و`proxy.ts`. لا يوجد middleware.ts في Next 16. `GET /logout` لا يغيّر الجلسة، و`POST /logout` يتحقق من المصدر؛ زر الخروج يستخدم Server Action محميًا.

## استكمال بوابة المتدرب — 13 نوفمبر 2026

طُبقت الهجرات `20261113140000` حتى `20261113180000` فعليًا على مشروع `easycoaching` المرتبط (بيئة الإنتاج) في جلسة الاستكمال. أكد `db push --remote --dry-run` عدم وجود هجرات معلّقة بعدها. لم تتغير إعدادات التخزين أو سياساته في هذه الجولة؛ فحوص الصور في المتصفح تستخدم تخزين التطوير المحلي.

يلزم مفتاح الخدمة على الخادم لحد محاولات تبادل الرابط. حد المحاولات ذري في القاعدة: 30 محاولة خلال 15 دقيقة، و429 مع `Retry-After`، وفشل الخدمة يعيد 503 دون إصدار جلسة. عند Vercel يستخدم عنوان الشبكة الذي تضبطه المنصة، ويخزن هاشًا يتغير يوميًا؛ لا يعتمد على ترويسات يرسلها المستخدم في استضافة أخرى. على الاستضافات الأخرى تشترك الطلبات في الحد الاحتياطي إلى أن يضاف تكامل موثوق مع الوكيل المستخدم. وجود المفتاح المشفر في إعدادات Vercel جرى التحقق منه بالاسم فقط، دون جلب قيمته.

إشعارات lint المستضافة لم تمنع تطبيق الهجرات: توجد تحذيرات تحويل ضمني إلى JSONB وتصنيف IMMUTABLE/STABLE ومتغير غير مستخدم في دوال حالية. اختبارات تنفيذ الحفظ والتحقق والصلاحيات مستقلة عن هذه التحذيرات. يجب مراجعتها عند صيانة دوال المخطط، ولا يُوصف lint بأنه خالٍ من التحذيرات.

توجيهات المدرب حقل JSON اختياري متوافق مع الخطط السابقة؛ لا نعيد تفسير وصف المكتبة القديم ولا نغير الخطط المحفوظة. الصيغ المضمونة للصور هي JPEG وPNG وWebP؛ يتطلب HEIC دعم فك الصورة في المتصفح أو تصدير JPG. لا تخزن الصور والاعتمادات محليًا بشكل دائم. مسار الأوزان دون اتصال الموجود مسبقًا يظل اختياريًا وقابلًا للمسح عند الخروج.

المراجع الأساسية: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)، [مصادقة الخادم](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)، [حماية Vercel](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).
