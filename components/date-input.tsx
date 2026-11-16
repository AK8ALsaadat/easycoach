"use client";
import { useEffect, useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale } from "./locale-provider";
import { parseDisplayDate, displayInputDate } from "@/lib/date-input";

/** Visible day/month/year text, ISO form value, optional native calendar. */
export function DateInput({ value, defaultValue, onChange, name, min, max, className = "field", type: _type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  void _type;
  const { t: tr } = useLocale();
  const uid = useId();
  const errorId = `${props.id ?? uid}-date-error`;
  const initial = String(value ?? defaultValue ?? "");
  const [iso, setIso] = useState(initial), [raw, setRaw] = useState(displayInputDate(initial));
  const [seen, setSeen] = useState(value);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null), calendar = useRef<HTMLInputElement>(null);
  const parsed = raw.trim() ? parseDisplayDate(raw) : "";
  const error = parsed === null ? tr("اكتب التاريخ بصيغة يوم/شهر/سنة") : parsed && ((min && parsed < String(min)) || (max && parsed > String(max))) ? tr("التاريخ خارج المدى المسموح") : "";
  useEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  if (seen !== value) { setSeen(value); if (value !== undefined) { setIso(String(value)); setRaw(displayInputDate(String(value))); } }
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => { if (value === undefined) { setIso(String(defaultValue ?? "")); setRaw(displayInputDate(String(defaultValue ?? ""))); setTouched(false); input.current?.setCustomValidity(""); } };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value, defaultValue]);
  function commit(next: string, event: ChangeEvent<HTMLInputElement>) {
    const parsed = next ? parseDisplayDate(next) : "";
    const error = parsed === null ? tr("اكتب التاريخ بصيغة يوم/شهر/سنة") : parsed && ((min && parsed < String(min)) || (max && parsed > String(max))) ? tr("التاريخ خارج المدى المسموح") : "";
    input.current?.setCustomValidity(error);
    if (parsed === null || error) return;
    setIso(parsed);
    onChange?.({ ...event, target: { ...event.target, value: parsed, name: name ?? "" }, currentTarget: { ...event.currentTarget, value: parsed } } as ChangeEvent<HTMLInputElement>);
  }
  return <><span className="date-input-wrap">
    <input {...props} ref={input} type="text" className={className} inputMode="numeric" dir="ltr" value={raw} data-date-name={name} placeholder="DD/MM/YYYY" autoComplete="off" aria-invalid={Boolean(touched && error) || props["aria-invalid"]} aria-describedby={[props["aria-describedby"], touched && error ? errorId : undefined].filter(Boolean).join(" ") || undefined} onChange={event => { setRaw(event.target.value); commit(event.target.value, event); }} onBlur={event => { setTouched(true); const parsed = parseDisplayDate(event.target.value); if (parsed) setRaw(displayInputDate(parsed)); props.onBlur?.(event); }} onInvalid={event => { if (error) { event.preventDefault(); setTouched(true); } props.onInvalid?.(event); }}/>
    {name && <input type="hidden" name={name} value={iso} disabled={props.disabled}/>}
    <button type="button" className="date-calendar-button" aria-label={tr("فتح التقويم")} disabled={props.disabled || props.readOnly} onClick={() => { try { calendar.current?.showPicker(); } catch { input.current?.focus(); } }}><CalendarDays size={18}/></button>
    <input ref={calendar} type="date" className="sr-only" tabIndex={-1} aria-hidden="true" value={iso} min={min} max={max} disabled={props.disabled || props.readOnly} onChange={event => { setRaw(displayInputDate(event.target.value)); commit(event.target.value, event); }}/>
  </span>{touched && error ? <span id={errorId} className="field-error block" aria-live="polite">{error}</span> : null}</>;
}
