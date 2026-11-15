# مراجعة الصلاحيات والموثوقية

15 نوفمبر 2026 — مراجعة مصدر واختبارات محلية؛ لا تمثل اختبار اختراق للإنتاج.

| المسار أو مجموعة الإجراءات | حد الصلاحية الذي روجع | دليل الاختبار |
|---|---|---|
| coach/clients/[id]، actions/management/studio/progress | JWT المستخدم → RPC → coach_id/RLS؛ تعذّر المعرف الأجنبي لا يكشف بياناته | account-isolation، client-lifecycle، core، studio |
| organization/[owner]/clients/[client]/program | التحقق من عضوية الفريق والصلاحية قبل تعديل برنامج مالك آخر | platform-team، platform-attendance |
| me، trainee/[id]، p/[token]، access/[id] | ربط trainee_user_id أو سر/إثبات جلسة صالح مرتبط بالبوابة؛ تجديد/سحب يلغي الوصول | bearer-portals، portal-session-route، verified-identity |
| api/media/[id] | media_access يسبق قراءة ملف أو توقيع URL؛ مسار ملف محلي يستخدم UUID متحققًا منه | studio، bearer-portals |
| api/exercise-media/[id] | id من المكتبة المعروفة؛ مدرب موثق أو تمرين ضمن البرنامج المنشور للمتدرب/البوابة | custom-exercise-media، studio |
| api/progress-photos/[id] | accessPhoto يتحقق من صلاحية الحساب/البوابة قبل قراءة/توقيع؛ لا كاش عام | photo-actions-security، progress-photo-security |
| api/local-upload/[id] | تطوير loopback فقط؛ UUID وسر رفع أو ملكية RPC؛ حد الحجم والتوقيع الفعلي | resumable-video، studio |
| api/coach-avatar/[id] | مورد عرض عام مقصود عبر coach_branding_avatar، وليس بيانات متدرب؛ UUID فقط | coach-branding، coach-branding-actions |
| api/support/tickets/[id] PATCH | مستخدم يطابق SUPPORT_OWNER_USER_ID فقط، Origin، UUID، JSON محدود ومخطط حالة strict | support-ticket-update |
| api/support/attachments/[id] GET | المؤلف أو مشغّل الدعم المحدد فقط؛ لا قراءة ملف قبل فحص الملكية | support-attachment-route، support-attachment-path |
| api/support/tickets GET/POST | قوائم المؤلف فقط أو المشغّل؛ حد فعلي للـstream ونوع/توقيع الملف و5 طلبات/ساعة في SQL | request-body، support-attachment-route |
| api/import، api/export، api/offline-plan | هوية المدرب/المتدرب أولًا؛ client من snapshot المعزول؛ استيراد بمعاملة وحدود وOrigin | management، account-isolation، pwa-session-isolation |
| api/session، api/analytics/events | المستخدم الحالي فقط أو receipt موقّع/مجزأ؛ لا بيانات مستأجر من id خارجي | tiktok-events، local-sessions |
| api/portal-session | Origin + حد stream + limiter ذري دائم + UUID/سر 256bit + جلسة HttpOnly | portal-session-route، portal-exchange-limit، bearer-portals |
| api/maintenance/* | سر cron خادمي؛ BILLING_ENABLED=false يمنع مهام الدفع | subscription-cron، photo-cleanup-route، free-platform |
| api/platform/*، api/payments/*، api/health/payments | معطلة مع BILLING_ENABLED=false؛ لا أسعار أو روابط دفع | free-platform، payment-launch، platform-payment-binding |

الجلسات: HttpOnly وSameSite؛ Secure مفروض في الإنتاج حتى لو أخطأ APP_URL. تسجيل الخروج يلغي الجلسة محليًا/في Supabase. لا تُحوّل أي قراءة مستأجر إلى service role. الاستعلامات المحلية تربط القيم، ومخططات Zod وSQL تتحقق من المدخلات. React يعالج النصوص بوصفها نصوصًا؛ لا نعرض نص مستخدم كـHTML.

تسجيل الدخول المحلي محدود بـ10 محاولات/15 دقيقة. الإنتاج يستخدم حدود Supabase Auth لطلبات كلمة المرور وOTP/رابط الدخول؛ يجب على المشغّل مراجعة حدود مشروعه والبريد قبل الإطلاق. مفاتيح وحدود المزود لم تتغير في هذه المهمة. لا ننشئ حسابات معاينة في الإنتاج؛ localPreview محذوف من بناء الإنتاج.

HSTS يظهر عندما يكون APP_URL على HTTPS؛ nosniff وDENY وReferrer-Policy وPermissions-Policy وCSP موجودة عالميًا. CSP لا يضيف script-src صارمًا يقطع Next أو TikTok؛ الوصول للبيانات لا يعتمد على CSP وحدها. لا نخزّن HTML خاصًا بكاش عام ولا نوسّع كاش الصور الخاصة.

لا هجرات ولا تغييرات لبيانات الإنتاج في هذه المراجعة. أي تشغيل بريد حقيقي أو تغيير حدود Auth أو سياسات الاحتفاظ يحتاج إعدادًا معتمدًا من المشغّل.
