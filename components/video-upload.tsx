"use client";
import { useLocale } from "./locale-provider";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { holdRefresh } from "@/lib/client-activity";
import QRCode from "qrcode";
import { Upload, QrCode, LoaderCircle, X, Check, RotateCcw } from "lucide-react";
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
  const { t: tr } = useLocale();

  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [phone, setPhone] = useState<{
      token: string;
      url: string;
      qr: string;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [finalizing, setFinalizing] = useState(false),
    [retry, setRetry] = useState<null | { assetId: string }>(null);
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
  async function finalize(assetId: string) {
    setFinalizing(true);
    setRetry(null);
    const release = holdRefresh("video-finalize");
    try {
      const result = await completeUpload(assetId, phoneToken);
      if (!result.ok) {
        // The upload itself is safe; only the check failed, so offer just that.
        setError(result.error ?? "تعذر تأكيد الفيديو");
        setRetry({ assetId });
        return;
      }
      onComplete(assetId);
      setDone(true);
      setProgress(null);
    } catch {
      setError("تعذر تأكيد الفيديو. أعد المحاولة؛ الملف المرفوع محفوظ.");
      setRetry({ assetId });
    } finally {
      release();
      setFinalizing(false);
    }
  }
  async function upload(file: File) {
    setError("");
    setDone(false);
    if (
      !["video/mp4", "video/webm", "video/quicktime"].includes(file.type) ||
      file.size > 200 * 1024 * 1024
    ) {
      setError("اختر MP4 أو MOV أو WebM حتى 200 ميجابايت");
      return;
    }
    setProgress(0);
    const release = holdRefresh("video-upload");
    try {
      const ticket = await uploadTicket(
        { filename: file.name, size: file.size, mime: file.type },
        phoneToken,
      );
      if (!ticket.ok || !ticket.url || !ticket.id) throw Error(ticket.error);
      if (ticket.resumable && file.size > 6 * 1024 * 1024) {
        const { uploadResumableVideo } = await import("@/lib/upload-exercise-video");
        await uploadResumableVideo(file, ticket.resumable, setProgress);
      } else await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", ticket.url!);
        xhr.setRequestHeader("Content-Type", file.type);
        if (phoneToken && ticket.url!.startsWith("/"))
          xhr.setRequestHeader("x-upload-token", phoneToken);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(Error("تعذر الرفع. جرّب ملفًا أصغر أو اتصالًا آخر"));
        xhr.onerror = () => reject(Error("انقطع الاتصال. أعد المحاولة"));
        xhr.timeout = 900000;
        xhr.ontimeout = () => reject(Error("انتهت مهلة الرفع"));
        xhr.send(file);
      });
      // The bytes are in storage. What follows is server-side verification,
      // which used to leave the bar frozen at 95% with no explanation.
      await finalize(ticket.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الرفع");
      setProgress(null);
      setFinalizing(false);
    } finally {
      release();
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
          disabled={progress !== null || finalizing}
          onClick={() => input.current?.click()}
        >
          {progress !== null || finalizing ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}{" "}
          {finalizing
            ? tr("نتحقق من الفيديو…")
            : progress !== null
            ? tr("جاري الرفع ") + progress + "%"
            : phoneToken
              ? tr("اختر فيديو من الجوال")
              : tr("ارفع فيديو")}
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
            {loading ? tr("نجهز QR…") : tr("من الجوال · QR")}
          </button>
        ) : null}
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs text-teal">
            <Check size={15} />
            {tr("تم إرفاق الفيديو")}
          </span>
        ) : null}
      </div>
      {finalizing ? (
        <p className="mt-3 text-xs text-muted" role="status">
          {tr("تم الرفع 100%. نتحقق من الملف وحفظه…")}
        </p>
      ) : null}
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded bg-line">
          <div
            className="h-full bg-teal transition-all"
            style={{ width: progress + "%" }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        {tr("MP4 / MOV / WebM · حتى 200 MB · الفيديو يُحفظ بجودته الأصلية")}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {tr(error)}
        </p>
      ) : null}
      {retry ? (
        <button type="button" className="btn-soft mt-2" disabled={finalizing} onClick={() => void finalize(retry.assetId)}>
          <RotateCcw size={15} />
          {tr("أعد محاولة التأكيد")}
        </button>
      ) : null}
      {phone ? (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tr("رفع من الجوال")}
            className="modal-sheet max-w-sm text-center"
          >
            <button
              className="btn-secondary float-left"
              aria-label={tr("إغلاق QR")}
              onClick={() => setPhone(null)}
            >
              <X size={16} />
            </button>
            <h2 className="pt-2">{tr("كمّل من جوالك")}</h2>
            <p className="mt-3 text-sm text-muted">
              {tr("امسح الرمز، اختر الفيديو، وبيظهر هنا تلقائيًا.")}
            </p>
            <Image
              unoptimized
              src={phone.qr}
              alt={tr("QR لرفع فيديو من الجوال")}
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
              {tr("افتح رابط الرفع")}
            </a>
            <p className="mt-4 text-xs text-muted">
              {tr("صالح 15 دقيقة لفيديو واحد. لا تشارك الرمز خارج أجهزتك.")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
