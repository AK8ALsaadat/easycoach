# الاستضافة والمصادقة

Vercel: مشروع `easycoach` الموجود مسبقًا والمرتبط بـ`AK8ALsaadat/easycoach`. النطاق: `https://easycoach-livid.vercel.app`. إعداد Vercel Authentication هو `all` لجميع النشرات، بما فيها الإنتاج. لا تُضف نطاقًا عامًا ولا تُعطّل الحماية قبل مراجعة المنتج وسياسة البيانات.

Supabase: `https://trlgsugychocgwtnmzej.supabase.co`، منطقة لندن. القاعدة منفصلة عن بقية مشاريع المستخدم. جميع البيانات المضافة للفحص اصطناعية.

## المتغيرات (Production / Preview / Development)

| المتغير | الاستخدام |
|---|---|
| `APP_MODE=supabase` | تفعيل القاعدة المستضافة، وليس القاعدة الملفية المحلية |
| `APP_URL` | النطاق الموثوق للروابط والرجوع؛ حاليًا `https://easycoach-livid.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | رابط المشروع؛ عام |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام المفضّل |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح anon للتوافق؛ لا صلاحيات إدارية |
| `SUPABASE_SERVICE_ROLE_KEY` | مشفّر وserver-only، لإدارة حسابات الاختبار عند الحاجة فقط؛ لا يُستخدم في عمليات العملاء |
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

المراجع الأساسية: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)، [مصادقة الخادم](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)، [حماية Vercel](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).
