import { notFound } from "next/navigation";
import { z } from "zod";
import { Brand } from "@/components/brand";
import { CoachIdentity } from "@/components/coach-identity";
import { AccessLink } from "@/components/access-link";
import { rpc } from "@/lib/server";
import { brandingPreview, type CoachBranding } from "@/lib/coach-branding";
type Props = { params: Promise<{ id: string }> };
async function branding(id: string) { if (!z.string().uuid().safeParse(id).success) return null; return rpc<CoachBranding | null>("public_portal_branding", { portal_id: id }, true); }
export async function generateMetadata({ params }: Props) { return brandingPreview(await branding((await params).id), process.env.APP_URL ?? "http://127.0.0.1:3200"); }
export default async function Access({ params }: Props) {
  const { id } = await params; const identity = await branding(id); if (!identity) notFound();
  return <main className="mx-auto max-w-lg px-5 py-10"><Brand /><section className="card mt-10 p-6"><CoachIdentity branding={identity} /><h1 className="mt-4 text-xl">بوابتك مع مدربك</h1><AccessLink portalId={id} /></section></main>;
}
