import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import React from "react";
import sharp from "sharp";

// Turns any hosted image (Bloom WebP, Higgsfield PNG, Drive JPEG...) into the
// Instagram-ready JPEG the Make poster needs, cropped to 4:5, 9:16 or 1:1, with
// an optional headline rendered by code so the lettering is always spelt right.
//
//   /api/jpeg?u=<image url>&ar=4x5&t=Autumn%20jobs%20to%20sell%20now&k=Landscapers
//
// u   source image (only hosts in ALLOWED below)
// ar  4x5 (default, 1080x1350), 9x16 (1080x1920) or 1x1 (1080x1080)
// t   headline (up to about 90 characters), k = small kicker line above it
// pos bottom (default), top or middle
// No login needed (see middleware): the agents and Instagram fetch it directly.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = [
  /(^|\.)rainbrand\.com$/,
  /(^|\.)trybloom\.ai$/,
  /(^|\.)higgsfield\.ai$/,
  /(^|\.)supabase\.co$/,
  /(^|\.)googleusercontent\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)vercel\.app$/,
  /(^|\.)cloudfront\.net$/,
  /(^|\.)amazonaws\.com$/,
  /(^|\.)apex-leads\.co\.uk$/,
];

const SIZES: Record<string, [number, number]> = { "4x5": [1080, 1350], "9x16": [1080, 1920], "1x1": [1080, 1080] };
const GREEN = "#22c55e";

let fontCache: ArrayBuffer | null = null;
async function loadFont(origin: string) {
  if (fontCache) return fontCache;
  const r = await fetch(`${origin}/fonts/InterDisplay-Bold.otf`);
  if (!r.ok) throw new Error("font missing");
  fontCache = await r.arrayBuffer();
  return fontCache;
}

function clean(s: string | null, max: number) {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function overlay(origin: string, w: number, h: number, headline: string, kicker: string, pos: string) {
  const font = await loadFont(origin);
  const size = headline.length <= 28 ? 92 : headline.length <= 50 ? 76 : 62;
  const justify = pos === "top" ? "flex-start" : pos === "middle" ? "center" : "flex-end";
  const gradient =
    pos === "top"
      ? "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)"
      : pos === "middle"
        ? "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)"
        : "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%)";
  const el = React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", justifyContent: justify, width: w, height: h, background: gradient, padding: "90px 72px" } },
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", borderLeft: `14px solid ${GREEN}`, paddingLeft: 36 } },
      kicker
        ? React.createElement("div", { style: { color: GREEN, fontSize: 34, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18, fontFamily: "Inter" } }, kicker)
        : null,
      React.createElement("div", { style: { color: "white", fontSize: size, lineHeight: 1.08, fontFamily: "Inter", textShadow: "0 4px 24px rgba(0,0,0,0.6)" } }, headline)
    )
  );
  const png = new ImageResponse(el, { width: w, height: h, fonts: [{ name: "Inter", data: font, weight: 700, style: "normal" }] });
  return Buffer.from(await png.arrayBuffer());
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const u = q.get("u");
  if (!u) return NextResponse.json({ error: "u (image url) is required" }, { status: 400 });
  let src: URL;
  try {
    src = new URL(u);
  } catch {
    return NextResponse.json({ error: "u must be a full URL" }, { status: 400 });
  }
  const sameHost = src.host === req.nextUrl.host;
  if (!sameHost && !(src.protocol === "https:" && ALLOWED.some((re) => re.test(src.hostname)))) {
    return NextResponse.json({ error: "source host not allowed" }, { status: 403 });
  }
  const [w, h] = SIZES[q.get("ar") ?? "4x5"] ?? SIZES["4x5"];
  const headline = clean(q.get("t"), 90);
  const kicker = clean(q.get("k"), 40);
  const pos = q.get("pos") ?? "bottom";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let input: Buffer;
  try {
    const r = await fetch(src.toString(), { signal: ctrl.signal, headers: { accept: "image/*" } });
    if (!r.ok) return NextResponse.json({ error: `source returned ${r.status}` }, { status: 502 });
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > 25 * 1024 * 1024) return NextResponse.json({ error: "source too large" }, { status: 413 });
    input = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ error: `could not fetch source: ${(e as Error).message}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  try {
    let img = sharp(input, { failOn: "none" }).rotate().resize(w, h, { fit: "cover", position: "attention" });
    if (headline) {
      const text = await overlay(req.nextUrl.origin, w, h, headline, kicker, pos);
      img = img.composite([{ input: text, top: 0, left: 0 }]);
    }
    const out = await img.flatten({ background: "#000" }).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(out.length),
        "cache-control": "public, max-age=3600, s-maxage=31536000, immutable",
        "x-jpeg-size": `${w}x${h}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `could not convert: ${(e as Error).message}` }, { status: 500 });
  }
}
