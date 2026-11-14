"use client";
import { useState } from "react";
import { useLocale } from "./locale-provider";
export function ReviewRating({ name, label, percent = false }: { name: string; label: string; percent?: boolean }) {
  const { t: tr } = useLocale();
  const [value, setValue] = useState(50);
  if (percent) return <label className="review-rating"><span>{label} <output><bdi dir="ltr">{value}%</bdi></output></span><input type="range" aria-label={label} name={name} min={0} max={100} step={1} value={value} onChange={event => setValue(Number(event.target.value))}/></label>;
  return <fieldset className="review-rating"><legend>{label}</legend><div className="rating-choices">{[1,2,3,4,5].map(number => <label key={number}><input type="radio" name={name} value={number} required aria-label={`${label}: ${number}`}/><span><bdi dir="ltr">{number}</bdi></span></label>)}</div><small className="text-muted">{tr("اختر درجة من 1 إلى 5")}</small></fieldset>;
}
