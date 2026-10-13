import { NextRequest, NextResponse } from "next/server";
import { requestSuspend, resumeSeparations } from "@/lib/stems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const shouldSuspend = req.nextUrl.searchParams.get("on") === "1";
  shouldSuspend ? requestSuspend() : resumeSeparations();
  return NextResponse.json({ ok: true });
}
