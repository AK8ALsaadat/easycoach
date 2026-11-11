import { notFound } from "next/navigation";
import { ClientPortal } from "@/components/client-portal";
import { linkBranding } from "@/lib/coach-branding-server";
import { brandingPreview } from "@/lib/coach-branding";
type Props = { params: Promise<{ token: string }> };
export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  return brandingPreview(await linkBranding(token, "p"), process.env.APP_URL ?? "http://127.0.0.1:3200");
}
export default async function Portal({ params }: Props) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  return <ClientPortal key={token} token={token} branding={await linkBranding(token, "p")} />;
}
