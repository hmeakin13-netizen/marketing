import { json, preflight } from "@/lib/http";
import { getUserId } from "@/lib/session";
import { linkVintedAccount, unlinkVintedAccount } from "@/lib/usage-store";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Link or unlink a Vinted account. Linking also happens implicitly on the first listing for an account. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { action?: string; vintedAccount?: string } | null;
  if (!body || typeof body.vintedAccount !== "string" || (body.action !== "link" && body.action !== "unlink")) {
    return json(req, { error: "Send { action: 'link' | 'unlink', vintedAccount }." }, 400);
  }
  const userId = getUserId(req);
  if (body.action === "link") {
    const r = await linkVintedAccount(userId, body.vintedAccount);
    return r.ok ? json(req, { ok: true, linked: r.usage.accounts }) : json(req, r, r.reason === "invalid_id" ? 400 : 403);
  }
  const r = await unlinkVintedAccount(userId, body.vintedAccount);
  return r.ok ? json(req, { ok: true, linked: r.usage.accounts }) : json(req, r, r.reason === "cooldown" ? 429 : 404);
}
