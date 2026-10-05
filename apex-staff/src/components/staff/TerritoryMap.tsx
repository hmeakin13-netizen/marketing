"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { distanceKm, geocodePostcode, type Territory } from "@/lib/staff/geo";

type Result =
  | { kind: "taken"; postcode: string; by: Territory; km: number }
  | { kind: "free"; postcode: string; nearest: { t: Territory; km: number } | null }
  | { kind: "unknown" };

export function TerritoryMap({ territories }: { territories: Territory[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marks = useRef<LayerGroup | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current || map.current) return;
      const m = L.map(el.current, { scrollWheelZoom: true, zoomControl: true }).setView([54.0, -2.5], 6);
      // Optional MapTiler key (NEXT_PUBLIC_MAPTILER_KEY) gives a dark styled map. Without one we use
      // standard OpenStreetMap tiles, which need no key, darkened with a CSS filter.
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      if (key) {
        L.tileLayer(`https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=${key}`, {
          attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
          maxZoom: 18,
        }).addTo(m);
      } else {
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 18,
          className: "osm-dark",
        }).addTo(m);
      }
      setTimeout(() => m.invalidateSize(), 300);
      for (const t of territories) {
        // Soft filled zone plus a dashed edge; overlapping zones build up so busy areas look denser.
        L.circle([t.lat, t.lng], {
          radius: Number(t.radius_km) * 1000,
          color: "#fb7185",
          weight: 1.5,
          dashArray: "6 6",
          fillColor: "#f43f5e",
          fillOpacity: 0.22,
        })
          .bindTooltip(`${t.name} — ${t.postcode} (${Number(t.radius_km)} km)`)
          .addTo(m);
        L.circleMarker([t.lat, t.lng], { radius: 4, color: "#fff", weight: 1, fillColor: "#f43f5e", fillOpacity: 1 }).addTo(m);
      }
      marks.current = L.layerGroup().addTo(m);
      map.current = m;
      if (territories.length > 0) {
        const b = L.latLngBounds(territories.map((t) => [t.lat, t.lng] as [number, number]));
        m.fitBounds(b.pad(0.6), { maxZoom: 9 });
      }
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, [territories]);

  async function check(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const g = await geocodePostcode(input);
    setBusy(false);
    if (!g) return setResult({ kind: "unknown" });

    let nearest: { t: Territory; km: number } | null = null;
    for (const t of territories) {
      const km = distanceKm(g.lat, g.lng, t.lat, t.lng);
      if (!nearest || km < nearest.km) nearest = { t, km };
    }
    const hit = nearest && nearest.km < Number(nearest.t.radius_km) ? nearest : null;
    const taken = hit !== null;
    setResult(hit ? { kind: "taken", postcode: g.postcode, by: hit.t, km: hit.km } : { kind: "free", postcode: g.postcode, nearest });

    const L = (await import("leaflet")).default;
    marks.current?.clearLayers();
    L.circleMarker([g.lat, g.lng], {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: taken ? "#f43f5e" : "#34d399",
      fillOpacity: 1,
    }).addTo(marks.current!);
    map.current?.setView([g.lat, g.lng], Math.max(map.current.getZoom(), 9));
  }

  return (
    <div>
      <form onSubmit={check} className="mb-4 flex flex-wrap gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter the lead's postcode, e.g. NG1 5FS"
          className="min-w-[16rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Check area"}
        </button>
      </form>

      {result?.kind === "taken" ? (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
          <p className="text-lg font-semibold text-rose-300">✕ Not available — area taken</p>
          <p className="text-sm text-zinc-300">
            {result.postcode} is {result.km.toFixed(1)} km from {result.by.name} ({result.by.postcode}), who has a{" "}
            {Number(result.by.radius_km)} km exclusive radius. Don&apos;t book this lead.
          </p>
        </div>
      ) : null}
      {result?.kind === "free" ? (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-lg font-semibold text-emerald-300">✓ Available — you can take them on</p>
          <p className="text-sm text-zinc-300">
            {result.postcode} is outside every client&apos;s radius
            {result.nearest
              ? `. Nearest is ${result.nearest.t.name} at ${result.nearest.km.toFixed(1)} km (their radius is ${Number(result.nearest.t.radius_km)} km).`
              : "."}
          </p>
        </div>
      ) : null}
      {result?.kind === "unknown" ? (
        <p className="mb-4 text-sm text-amber-300">Couldn&apos;t find that postcode. Check it and try again.</p>
      ) : null}

      <div ref={el} className="h-[560px] w-full overflow-hidden rounded-2xl border border-white/10" />
      <p className="mt-2 text-xs text-zinc-500">
        Red zones are taken. Anywhere outside them is free. {territories.length} active client area
        {territories.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
