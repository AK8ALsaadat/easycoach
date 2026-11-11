export type CoachBranding = {
  coach_id?: string;
  name: string;
  display_name?: string;
  avatar_id: string | null;
  updated_at?: string | null;
};
export const avatarUrl = (branding?: CoachBranding | null) =>
  branding?.avatar_id ? `/api/coach-avatar/${branding.avatar_id}` : "/coach-avatar.svg";

export function brandingPreview(branding: CoachBranding | null, origin: string) {
  const title = branding ? `مساحتك مع ${branding.name}` : "مساحتك التدريبية";
  const description = "برنامجك ومتابعتك مع مدربك عبر إيزي كوتش.";
  const image = new URL(branding?.avatar_id ? avatarUrl(branding) : "/coach-avatar.png", origin).href;
  return {
    title,
    description,
    referrer: "no-referrer" as const,
    robots: { index: false, follow: false, noarchive: true },
    openGraph: { title, description, siteName: "EasyCoach · إيزي كوتش", images: [{ url: image, width: 512, height: 512, alt: branding?.name ?? "إيزي كوتش" }] },
    twitter: { card: "summary" as const, title, description, images: [image] },
  };
}
