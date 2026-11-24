import { NextResponse } from "next/server";

// Tells the installed app which build is live so it can reload itself after a deploy.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev" },
    { headers: { "cache-control": "no-store" } }
  );
}
