export interface Territory {
  id: string;
  client_id: string | null;
  name: string;
  postcode: string;
  lat: number;
  lng: number;
  radius_km: number;
  active: boolean;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Look a UK postcode (or outcode like "NG1") up on postcodes.io. Works on server and in the browser. */
export async function geocodePostcode(input: string): Promise<{ postcode: string; lat: number; lng: number } | null> {
  const clean = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (!clean) return null;
  const enc = encodeURIComponent(clean);
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${enc}`);
    if (res.ok) {
      const j = await res.json();
      if (j.result) return { postcode: j.result.postcode, lat: j.result.latitude, lng: j.result.longitude };
    }
    if (!clean.includes(" ") && clean.length <= 4) {
      const o = await fetch(`https://api.postcodes.io/outcodes/${enc}`);
      if (o.ok) {
        const j = await o.json();
        if (j.result) return { postcode: j.result.outcode, lat: j.result.latitude, lng: j.result.longitude };
      }
    }
  } catch {
    return null;
  }
  return null;
}
