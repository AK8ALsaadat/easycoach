import { NextResponse } from "next/server";
import { actor } from "@/lib/server";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

/**
 * Who the cookies say you are, right now. The client compares this with the
 * identity its page was rendered for, so a session that was replaced or has
 * expired is reported in place instead of silently rendering another account's
 * data or hard-redirecting away from unsaved work.
 */
export async function GET() {
  try {
    const user = await actor();
    if (!user) return NextResponse.json({ ok: false }, { status: 401, headers });
    return NextResponse.json({ ok: true, userId: user.id, role: user.role }, { headers });
  } catch {
    // Unknown (network/Auth hiccup): never claim the session is gone.
    return NextResponse.json({ ok: true, unknown: true }, { status: 200, headers });
  }
}
