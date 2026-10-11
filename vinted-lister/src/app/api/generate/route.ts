import { ADDON_ACCOUNT_PENCE, checkQuota, linkAccount, normaliseAccountId, PLANS, slotsFor } from "@/lib/plans";
import { ALLOWED_TYPES, generateListing, ListingError, MAX_PHOTOS, MAX_PHOTO_BYTES, type Photo, type PhotoType } from "@/lib/listing";
import { json, preflight } from "@/lib/http";
import { getUserId } from "@/lib/session";
import { getUsage, recordListing } from "@/lib/usage-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const userId = getUserId(req);

  const form = await req.formData();

  // Which Vinted account is this for? One is included per subscription; more are £20/month each.
  const rawAccount = form.get("vintedAccount");
  const account = typeof rawAccount === "string" ? normaliseAccountId(rawAccount) : null;
  if (!account) return json(req, { error: "account_required", message: "Enter the Vinted username this listing is for." }, 400);

  const before = await getUsage(userId);
  const link = linkAccount(before, account);
  if (!link.ok) {
    return json(
      req,
      {
        error: "account_not_linked",
        slots: slotsFor(before),
        linked: before.accounts ?? [],
        canBuyMore: link.reason === "slots_full" ? link.canBuyMore : false,
        addonPence: ADDON_ACCOUNT_PENCE,
      },
      403,
    );
  }

  // Check quota before the API call so a blocked user never costs us a request.
  const quota = checkQuota(before);
  if (!quota.allowed) {
    return json(req, { error: "limit_reached", quota }, 402);
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (files.length === 0 || files.length > MAX_PHOTOS) {
    return json(req, { error: `Upload 1-${MAX_PHOTOS} photos.` }, 400);
  }

  const photos: Photo[] = [];
  for (const file of files) {
    if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      return json(req, { error: "Photos must be JPEG, PNG, WebP or GIF." }, 400);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return json(req, { error: "Each photo must be under 5MB." }, 400);
    }
    photos.push({ mediaType: file.type as PhotoType, data: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  try {
    const notes = form.get("notes");
    const listing = await generateListing(photos, typeof notes === "string" ? notes : undefined);
    const usage = await recordListing(userId, account);
    return json(req, { listing, plan: PLANS[usage.plan].name, quota: checkQuota(usage) });
  } catch (err) {
    if (err instanceof ListingError) return json(req, { error: err.message }, err.status);
    console.error("generate failed", err);
    return json(req, { error: "Something went wrong generating the listing. You weren't charged a listing." }, 500);
  }
}
