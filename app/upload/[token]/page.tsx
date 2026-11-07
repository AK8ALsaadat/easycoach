"use client";
import {use,useState} from 'react';
import {Brand} from '@/components/brand';
import {VideoUpload} from '@/components/video-upload';
import {CheckCircle} from 'lucide-react';
export default function Upload({params}:{params:Promise<{token:string}>}){const {token}=use(params);const [done,setDone]=useState(false);if(!/^[a-f0-9]{64}$/.test(token))return <p className="p-8">الرابط غير صالح</p>;return <main className="portal-gate"><Brand/><section className="card mx-auto my-auto w-full max-w-md p-7">{done?<><CheckCircle size={45} className="mb-5 text-teal"/><h1>وصل الفيديو.</h1><p className="mt-4 text-muted">ارجع للكمبيوتر؛ الفيديو انضاف للحركة. تقدر تقفل الصفحة.</p></>:<><p className="eyebrow">PHONE → PROGRAM</p><h1 className="my-4">من تصويرك،<br/>لجدول عميلك.</h1><p className="mb-6 text-sm text-muted">اختر فيديو شرح الحركة. اترك صفحة الجدول مفتوحة على الكمبيوتر.</p><VideoUpload phoneToken={token} onComplete={()=>setDone(true)}/></>}</section></main>}
