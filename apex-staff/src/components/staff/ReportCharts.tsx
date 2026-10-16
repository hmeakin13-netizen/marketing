"use client";

import { useState } from "react";

export interface DayPoint {
  date: string; // YYYY-MM-DD
  label: string; // "Thu 16"
  dials: number | null;
  conversations: number | null;
  booked: number | null;
  calls: number;
  showed: number;
  noShow: number;
  showRate: number | null; // percent
  dialsPerHour: number | null;
}

// Dark-mode categorical steps, validated together on the dark surface. Dials sit on their own chart
// (a different scale), so their orange never competes with the five result lines.
const SERIES = [
  { key: "dials", label: "Calls made (dials)", color: "#d95926" },
  { key: "conversations", label: "Conversations", color: "#9085e9" },
  { key: "booked", label: "Calls booked", color: "#c98500" },
  { key: "calls", label: "Calls that day", color: "#3987e5" },
  { key: "showed", label: "Showed", color: "#199e70" },
  { key: "noShow", label: "No-shows", color: "#e66767" },
] as const;
type Key = (typeof SERIES)[number]["key"];

const W = 720;
const H = 260;
const PAD = { l: 36, r: 16, t: 14, b: 30 };

function scaleX(i: number, n: number) {
  return PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
}
function niceMax(v: number) {
  // Four even gridline steps with whole-number labels.
  const unit = v <= 8 ? 1 : v <= 40 ? 2 : v <= 100 ? 5 : v <= 400 ? 10 : 50;
  return Math.max(4, Math.ceil(v / (4 * unit)) * 4 * unit);
}

/** Splits a series into runs so missing days leave a gap in the line instead of dropping to zero. */
function runs(values: (number | null)[]) {
  const out: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) out.push(cur);
  return out;
}

function Axes({ days, max, ticks = 4, unit = "" }: { days: DayPoint[]; max: number; ticks?: number; unit?: string }) {
  const n = days.length;
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  return (
    <g>
      {Array.from({ length: ticks + 1 }, (_, k) => (max / ticks) * k).map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity={0.07} />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#a1a1aa">
            {Math.round(v)}
            {unit}
          </text>
        </g>
      ))}
      {days.map((d, i) =>
        n <= 8 || i % 2 === 0 || i === n - 1 ? (
          <text key={d.date} x={scaleX(i, n)} y={H - 8} textAnchor="middle" fontSize="11" fill="#a1a1aa">
            {d.label}
          </text>
        ) : null
      )}
    </g>
  );
}

export function ActivityChart({ days, keys, title }: { days: DayPoint[]; keys: Key[]; title: string }) {
  const [off, setOff] = useState<Set<Key>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const shown = SERIES.filter((s) => keys.includes(s.key));
  const active = shown.filter((s) => !off.has(s.key));
  const max = niceMax(Math.max(1, ...active.flatMap((s) => days.map((d) => Number(d[s.key] ?? 0)))));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {shown.map((s) => {
          const on = !off.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setOff((p) => { const nx = new Set(p); if (on) nx.add(s.key); else nx.delete(s.key); return nx; })}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${on ? "border-white/20 text-zinc-100" : "border-white/10 text-zinc-500"}`}
            >
              <span className="inline-block h-2 w-5 rounded-full" style={{ background: s.color, opacity: on ? 1 : 0.3 }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        <Axes days={days} max={max} />
        {active.map((s) =>
          runs(days.map((d) => d[s.key] as number | null)).map((run, k) => (
            <polyline key={`${s.key}${k}`} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={run.map((p) => `${scaleX(p.i, n)},${y(p.v)}`).join(" ")} />
          ))
        )}
        {active.map((s) =>
          days.map((d, i) =>
            d[s.key] === null ? null : <circle key={`${s.key}${i}`} cx={scaleX(i, n)} cy={y(Number(d[s.key]))} r={hover === i ? 5 : 4} fill={s.color} stroke="#18181b" strokeWidth={2} />
          )
        )}
        {hover !== null ? <line x1={scaleX(hover, n)} x2={scaleX(hover, n)} y1={PAD.t} y2={H - PAD.b} stroke="#fff" strokeOpacity={0.25} /> : null}
        {days.map((d, i) => (
          <rect key={d.date} x={scaleX(i, n) - (W - PAD.l - PAD.r) / (n - 1) / 2} y={PAD.t} width={(W - PAD.l - PAD.r) / (n - 1)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null ? (
        <div className="mt-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200">
          <p className="mb-1 font-medium text-white">{days[hover].label}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            {shown.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <b>{days[hover][s.key] ?? "–"}</b>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">Hover a day to compare. Tap a name above to hide or show a line.</p>
      )}
    </div>
  );
}

export function RateChart({ days, target = 70 }: { days: DayPoint[]; target?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const color = "#199e70";
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Show rate by day" onMouseLeave={() => setHover(null)}>
        <Axes days={days} max={100} unit="%" />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#fff" strokeOpacity={0.4} strokeDasharray="5 5" />
        <text x={W - PAD.r} y={y(target) - 6} textAnchor="end" fontSize="11" fill="#d4d4d8">
          target {target}%
        </text>
        {runs(days.map((d) => d.showRate)).map((run, k) => (
          <polyline key={k} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={run.map((p) => `${scaleX(p.i, n)},${y(p.v)}`).join(" ")} />
        ))}
        {days.map((d, i) =>
          d.showRate === null ? null : <circle key={d.date} cx={scaleX(i, n)} cy={y(d.showRate)} r={hover === i ? 5 : 4} fill={d.showRate >= target ? color : "#18181b"} stroke={color} strokeWidth={2} />
        )}
        {days.map((d, i) => (
          <rect key={`h${d.date}`} x={scaleX(i, n) - (W - PAD.l - PAD.r) / (n - 1) / 2} y={PAD.t} width={(W - PAD.l - PAD.r) / (n - 1)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      <p className="mt-1 text-xs text-zinc-500">
        {hover !== null
          ? `${days[hover].label}: ${days[hover].showRate === null ? "no calls logged" : `${Math.round(days[hover].showRate!)}% showed (${days[hover].showed} of ${days[hover].showed + days[hover].noShow})`}`
          : "Filled dots beat the target. Hover a day for the numbers."}
      </p>
    </div>
  );
}

export function PerHourChart({ days }: { days: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const max = niceMax(Math.max(1, ...days.map((d) => d.dialsPerHour ?? 0)));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / n;
  const best = Math.max(...days.map((d) => d.dialsPerHour ?? 0));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dials per hour worked" onMouseLeave={() => setHover(null)}>
        <Axes days={days} max={max} />
        {days.map((d, i) => {
          if (d.dialsPerHour === null) return null;
          const x = PAD.l + slot * i + slot * 0.2;
          const w = slot * 0.6;
          const top = y(d.dialsPerHour);
          return <path key={d.date} d={`M${x},${H - PAD.b} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + w - 4} Q${x + w},${top} ${x + w},${top + 4} V${H - PAD.b} Z`} fill={d.dialsPerHour === best && best > 0 ? "#3987e5" : "#3987e5"} fillOpacity={hover === i ? 1 : d.dialsPerHour === best ? 1 : 0.65} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />;
        })}
        {days.map((d, i) => (
          <rect key={`h${d.date}`} x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      <p className="mt-1 text-xs text-zinc-500">
        {hover !== null
          ? `${days[hover].label}: ${days[hover].dialsPerHour === null ? "no report" : `${days[hover].dialsPerHour!.toFixed(1)} dials an hour`}`
          : "Dials per hour worked. Your best day is the solid bar."}
      </p>
    </div>
  );
}
