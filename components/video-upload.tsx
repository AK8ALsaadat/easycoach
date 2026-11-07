"use client";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Upload, QrCode, LoaderCircle, X, Check } from "lucide-react";
import {
  uploadTicket,
  completeUpload,
  createPhoneUpload,
  phoneUploadStatus,
} from "@/app/studio-actions";
export function VideoUpload({
  onComplete,
  phoneToken,
}: {
  onComplete: (id: string) => void;
  phoneToken?: string;
}) {
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [phone, setPhone] = useState<{
      token: string;
      url: string;
      qr: string;
    } | null>(null),
    [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const callback = useRef(onComplete);
  useEffect(() => {
    callback.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    if (!phone) return;
    let active = true;
    const timer = setInterval(async () => {
      const r = await phoneUploadStatus(phone.token);
      if (!active) return;
      if (r.id) {
        callback.current(r.id);
        setPhone(null);
        setDone(true);
      } else if (!r.ok) {
        setError(r.error ?? "انتهى الرابط");
        setPhone(null);
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [phone]);
  async function upload(file: File) {
    setError("");
    setDone(false);
    if (
      !["video/mp4", "video/webm", "video/quicktime"].includes(file.type) ||
      file.size > 50 * 1024 * 1024
    ) {
      setError("اختر MP4 أو MOV أو WebM حتى 50 ميجابايت");
      return;
    }
    setProgress(0);
    try {
      const ticket = await uploadTicket(
        { filename: file.name, size: file.size, mime: file.type },
        phoneToken,
      );
      if (!ticket.ok || !ticket.url || !ticket.id) throw Error(ticket.error);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", ticket.url!);
        xhr.setRequestHeader("Content-Type", file.type);
        if (phoneToken && ticket.url!.startsWith("/"))
          xhr.setRequestHeader("x-upload-token", phoneToken);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 95));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(Error("تعذر الرفع. جرّب ملفًا أصغر أو اتصالًا آخر"));
        xhr.onerror = () => reject(Error("انقطع الاتصال. أعد المحاولة"));
        xhr.timeout = 300000;
        xhr.ontimeout = () => reject(Error("انتهت مهلة الرفع"));
        xhr.send(file);
      });
      const result = await completeUpload(ticket.id, phoneToken);
      if (!result.ok) throw Error(result.error);
      onComplete(ticket.id);
      setDone(true);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الرفع");
      setProgress(null);
    }
  }
  return (
    <div className="video-uploader">
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={progress !== null}
          onClick={() => input.current?.click()}
        >
          {progress !== null ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}{" "}
          {progress !== null
            ? "جاري الرفع " + progress + "%"
            : phoneToken
              ? "اختر فيديو من الجوال"
              : "ارفع فيديو"}
        </button>
        {!phoneToken ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || progress !== null}
            onClick={async () => {
              setLoading(true);
              setError("");
              try {
                const r = await createPhoneUpload();
                if (!r.ok || !r.url || !r.token) throw Error(r.error);
                setPhone({
                  token: r.token,
                  url: r.url,
                  qr: await QRCode.toDataURL(r.url, {
                    width: 240,
                    margin: 2,
                    color: { dark: "#151916", light: "#ffffff" },
                  }),
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "تعذر إنشاء QR");
              } finally {
                setLoading(false);
              }
            }}
          >
            <QrCode size={16} />
            {loading ? "نجهز QR…" : "من الجوال · QR"}
          </button>
        ) : null}
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs text-teal">
            <Check size={15} />
            تم إرفاق الفيديو
          </span>
        ) : null}
      </div>
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded bg-line">
          <div
            className="h-full bg-teal transition-all"
            style={{ width: progress + "%" }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        MP4 / MOV / WebM · حتى 50 MB · فيديو شرح الحركة
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {phone ? (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="رفع من الجوال"
            className="modal-sheet max-w-sm text-center"
          >
            <button
              className="btn-secondary float-left"
              aria-label="إغلاق QR"
              onClick={() => setPhone(null)}
            >
              <X size={16} />
            </button>
            <h2 className="pt-2">كمّل من جوالك</h2>
            <p className="mt-3 text-sm text-muted">
              امسح الرمز، اختر الفيديو، وبيظهر هنا تلقائيًا.
            </p>
            <Image
              unoptimized
              src={phone.qr}
              alt="QR لرفع فيديو من الجوال"
              width={240}
              height={240}
              className="mx-auto my-5"
            />
            <a
              href={phone.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-teal underline"
            >
              افتح رابط الرفع
            </a>
            <p className="mt-4 text-xs text-muted">
              صالح 15 دقيقة لفيديو واحد. لا تشارك الرمز خارج أجهزتك.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
