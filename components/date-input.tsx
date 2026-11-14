"use client";
import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale } from "./locale-provider";
import { parseDisplayDate, displayInputDate } from "@/lib/date-input";

/** Visible day/month/year text, ISO form value, optional native calendar. */
export function DateInput({ value, defaultValue, onChange, name, min, max, className = "field", type: _type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  void _type;
  const { t: tr } = useLocale();
  const initial = String(value ?? defaultValue ?? "");
  const [iso, setIso] = useState(initial), [raw, setRaw] = useState(displayInputDate(initial));
  const [seen, setSeen] = useState(value);
  const input = useRef<HTMLInputElement>(null), calendar = useRef<HTMLInputElement>(null);
  if (seen !== value) { setSeen(value); if (value !== undefined) { setIso(String(value)); setRaw(displayInputDate(String(value))); } }
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => { if (value === undefined) { setIso(String(defaultValue ?? "")); setRaw(displayInputDate(String(defaultValue ?? ""))); input.current?.setCustomValidity(""); } };
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
  return <span className="date-input-wrap">
    <input {...props} ref={input} type="text" className={className} inputMode="numeric" dir="ltr" value={raw} data-date-name={name} placeholder="DD/MM/YYYY" autoComplete="off" onChange={event => { setRaw(event.target.value); commit(event.target.value, event); }} onBlur={event => { const parsed = parseDisplayDate(event.target.value); if (parsed) setRaw(displayInputDate(parsed)); props.onBlur?.(event); }}/>
    {name && <input type="hidden" name={name} value={iso} disabled={props.disabled}/>}
    <button type="button" className="date-calendar-button" aria-label={tr("فتح التقويم")} disabled={props.disabled} onClick={() => { try { calendar.current?.showPicker(); } catch { input.current?.focus(); } }}><CalendarDays size={18}/></button>
    <input ref={calendar} type="date" className="sr-only" tabIndex={-1} aria-hidden="true" value={iso} min={min} max={max} disabled={props.disabled} onChange={event => { setRaw(displayInputDate(event.target.value)); commit(event.target.value, event); }}/>
  </span>;
}
