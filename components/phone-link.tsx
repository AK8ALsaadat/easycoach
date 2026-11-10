"use client";
import { MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/contact";
import { useLocale } from "./locale-provider";

export function PhoneLink({phone}:{phone:string}) {
  const {t:tr}=useLocale();const href=whatsappUrl(phone);
  return href ? <a className="client-phone-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={tr("فتح واتساب {0}",phone)} onClick={event=>event.stopPropagation()}><MessageCircle size={15} aria-hidden="true"/><span dir="ltr">{phone}</span></a> : phone ? <span dir="ltr" className="text-xs text-muted">{phone}</span> : null;
}
