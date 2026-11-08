"use client";
import { useLocale } from "@/components/locale-provider";

import { use, useState } from "react";
import { Brand } from "@/components/brand";
import { VideoUpload } from "@/components/video-upload";
import { CheckCircle } from "lucide-react";
export default function Upload({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { t: tr } = useLocale();
  const { token } = use(params);
  const [done, setDone] = useState(false);
  if (!/^[a-f0-9]{64}$/.test(token))
    return <p className="p-8">{tr("الرابط غير صالح")}</p>;
  return (
    <main className="portal-gate">
      <Brand />
      <section className="card mx-auto my-auto w-full max-w-md p-7">
        {done ? (
          <>
            <CheckCircle size={45} className="mb-5 text-teal" />
            <h1>{tr("وصل الفيديو.")}</h1>
            <p className="mt-4 text-muted">
              {tr("ارجع للكمبيوتر؛ الفيديو انضاف للحركة. تقدر تقفل الصفحة.")}
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">{tr("من الجوال إلى البرنامج")}</p>
            <h1 className="my-4">
              {tr("من تصويرك،")}
              <br />
              {tr("لجدول عميلك.")}
            </h1>
            <p className="mb-6 text-sm text-muted">
              {tr(
                "اختر فيديو شرح الحركة. اترك صفحة الجدول مفتوحة على الكمبيوتر.",
              )}
            </p>
            <VideoUpload phoneToken={token} onComplete={() => setDone(true)} />
          </>
        )}
      </section>
    </main>
  );
}
