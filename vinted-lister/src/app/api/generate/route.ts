import { NextResponse } from "next/server";
import { checkQuota, PLANS } from "@/lib/plans";
import { ALLOWED_TYPES, generateListing, ListingError, MAX_PHOTOS, MAX_PHOTO_BYTES, type Photo, type PhotoType } from "@/lib/listing";
import { getOrCreateUserId } from "@/lib/session";
import { getUsage, recordListing } from "@/lib/usage-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = getOrCreateUserId();

  // Check quota first so a blocked user never costs us an API call.
  const quota = checkQuota(await getUsage(userId));
  if (!quota.allowed) {
    return NextResponse.json({ error: "limit_reached", quota }, { status: 402 });
  }

  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (files.length === 0 || files.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Upload 1-${MAX_PHOTOS} photos.` }, { status: 400 });
  }

  const photos: Photo[] = [];
  for (const file of files) {
    if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json({ error: "Photos must be JPEG, PNG, WebP or GIF." }, { status: 400 });
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Each photo must be under 5MB." }, { status: 400 });
    }
    photos.push({ mediaType: file.type as PhotoType, data: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  try {
    const notes = form.get("notes");
    const listing = await generateListing(photos, typeof notes === "string" ? notes : undefined);
    const usage = await recordListing(userId);
    return NextResponse.json({ listing, plan: PLANS[usage.plan].name, quota: checkQuota(usage) });
  } catch (err) {
    if (err instanceof ListingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("generate failed", err);
    return NextResponse.json({ error: "Something went wrong generating the listing. You weren't charged a listing." }, { status: 500 });
  }
}
