"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Map as MapLibreMap, StyleSpecification, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { distanceKm, geocodePostcode, type Territory } from "@/lib/staff/geo";

type Result =
  | { kind: "taken"; postcode: string; by: Territory; km: number }
  | { kind: "free"; postcode: string; nearest: { t: Territory; km: number } | null }
  | { kind: "unknown" };

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "&copy; OpenStreetMap contributors", maxzoom: 18 },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-brightness-max": 0.55, "raster-saturation": -0.6, "raster-contrast": 0.2 } }],
};

/** A circle of `km` radius as a polygon ring. */
function circle(lat: number, lng: number, km: number, steps = 72): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dLat = (km / 6371) * Math.cos(a);
    const dLng = ((km / 6371) * Math.sin(a)) / Math.cos((lat * Math.PI) / 180);
    pts.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return pts;
}

export function TerritoryMap({ territories }: { territories: Territory[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const searched = useRef<{ lat: number; lng: number; taken: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const zones = () => ({
    type: "FeatureCollection" as const,
    features: territories.map((t) => ({
      type: "Feature" as const,
      properties: { name: `${t.name} — ${t.postcode} (${Number(t.radius_km)} km)` },
      geometry: { type: "Polygon" as const, coordinates: [circle(t.lat, t.lng, Number(t.radius_km))] },
    })),
  });
  const centres = () => ({
    type: "FeatureCollection" as const,
    features: territories.map((t) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] } })),
  });
  const pin = () => ({
    type: "FeatureCollection" as const,
    features: searched.current
      ? [{ type: "Feature" as const, properties: { taken: searched.current.taken }, geometry: { type: "Point" as const, coordinates: [searched.current.lng, searched.current.lat] } }]
      : [],
  });

  useEffect(() => {
    let dead = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (dead || !el.current || map.current) return;
      // OpenFreeMap: free vector map, no account or key. Attribution is shown by the map itself.
      const m = new ml.Map({
        container: el.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-2.5, 54.0],
        zoom: 4.8,
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

      // Our red zones go on top of whichever base style loaded.
      const addOverlay = () => {
        if (m.getSource("zones")) return;
        m.addSource("zones", { type: "geojson", data: zones() });
        m.addSource("centres", { type: "geojson", data: centres() });
        m.addSource("pin", { type: "geojson", data: pin() });
        m.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": "#f43f5e", "fill-opacity": 0.22 } });
        m.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": "#fb7185", "line-width": 1.5, "line-dasharray": [3, 2] } });
        m.addLayer({ id: "centres", type: "circle", source: "centres", paint: { "circle-radius": 4, "circle-color": "#f43f5e", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
        m.addLayer({
          id: "pin",
          type: "circle",
          source: "pin",
          paint: { "circle-radius": 9, "circle-color": ["case", ["get", "taken"], "#f43f5e", "#34d399"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
        });
      };
      let fellBack = false;
      // Re-add our zones whenever the base style (re)loads or is swapped.
      m.on("style.load", addOverlay);
      m.on("styledata", () => {
        if (m.isStyleLoaded()) addOverlay();
      });
      m.on("error", (e) => {
        // Only if the base STYLE itself fails to load, fall back to plain OpenStreetMap.
        const url = String((e as unknown as { error?: { url?: string } }).error?.url ?? "");
        if (!fellBack && url.includes("/styles/")) {
          fellBack = true;
          m.setStyle(OSM_STYLE, { diff: false });
        }
      });
      m.on("click", "zones-fill", (e) => {
        const f = e.features?.[0];
        if (f) new ml.Popup().setLngLat(e.lngLat).setText(String(f.properties?.name)).addTo(m);
      });
      if (territories.length > 0) {
        const b = new ml.LngLatBounds();
        for (const t of territories) b.extend([t.lng, t.lat]);
        m.fitBounds(b, { padding: 120, maxZoom: 8, animate: false });
      }
      map.current = m;
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setResult(hit ? { kind: "taken", postcode: g.postcode, by: hit.t, km: hit.km } : { kind: "free", postcode: g.postcode, nearest });

    searched.current = { lat: g.lat, lng: g.lng, taken: hit !== null };
    const src = map.current?.getSource("pin") as GeoJSONSource | undefined;
    src?.setData(pin());
    map.current?.flyTo({ center: [g.lng, g.lat], zoom: Math.max(map.current.getZoom(), 8.5) });
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
