import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE = "vl_uid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Prototype identity. The web app uses an anonymous httpOnly cookie; the Chrome extension sends the
 * same id as `Authorization: Bearer <key>` (shown on the web page). Replace both with Supabase auth
 * and a revocable per-device token before charging anyone: this id is effectively a password.
 */
export function getUserId(req?: Request): string {
  const bearer = req?.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer && UUID.test(bearer)) return bearer.toLowerCase();
  const jar = cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}
