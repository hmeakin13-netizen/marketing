import "server-only";
import { NextResponse } from "next/server";

/** Only the Chrome extension needs cross-origin access. Auth is a bearer key, not cookies. */
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin?.startsWith("chrome-extension://")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}
