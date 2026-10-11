import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE = "vl_uid";

/** Prototype identity: an anonymous httpOnly cookie. Replace with Supabase auth before charging anyone. */
export function getOrCreateUserId(): string {
  const jar = cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}
