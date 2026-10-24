import type { TeamAgent, TeamEvent } from "@/lib/staff/admaker";

/**
 * The research team as an office floor: the manager at the top, the learning brain in the middle,
 * a robot at each desk. A robot's eyes glow while it is working; a line glows when something was
 * really handed along it in the last three hours. Nothing here is decoration that is not backed by a row.
 */

export const POS: Record<string, { x: number; y: number }> = {
  lead: { x: 500, y: 78 },
  scout: { x: 105, y: 200 },
  analyst: { x: 255, y: 200 },
  voice: { x: 105, y: 340 },
  timing: { x: 255, y: 340 },
  checker: { x: 500, y: 515 },
  numbers: { x: 745, y: 200 },
  maker: { x: 895, y: 200 },
  reviews: { x: 105, y: 480 },
  trends: { x: 255, y: 480 },
  copy: { x: 745, y: 340 },
  photos: { x: 895, y: 340 },
  budget: { x: 745, y: 480 },
  judge: { x: 895, y: 480 },
  adslead: { x: 820, y: 78 },
  web: { x: 500, y: 995 },
  sitehealth: { x: 160, y: 1090 },
  rank: { x: 380, y: 1090 },
  seo: { x: 620, y: 1090 },
  local: { x: 840, y: 1090 },
  fin: { x: 500, y: 1250 },
  cash: { x: 160, y: 1345 },
  invoices: { x: 380, y: 1345 },
  spend: { x: 620, y: 1345 },
  profit: { x: 840, y: 1345 },
};

/** Desks nobody sits at yet. Shown as open desks so the roadmap is visible; they never show as working. */
export const PLANNED: { name: string; role: string; x: number; y: number }[] = [
  { name: "Care Lead", role: "Manager: client care", x: 230, y: 690 },
  { name: "Client Check-in", role: "Asks for booked and won", x: 95, y: 800 },
  { name: "Report Writer", role: "Weekly client reports", x: 225, y: 800 },
  { name: "Video Requester", role: "Asks owners for clips", x: 355, y: 800 },
  { name: "Marketing Lead", role: "Manager: social media", x: 715, y: 690 },
  { name: "Content Planner", role: "Plans posts and reels", x: 520, y: 800 },
  { name: "Caption Writer", role: "Captions, cuts, remixes", x: 650, y: 800 },
  { name: "Publisher", role: "Posts across platforms", x: 780, y: 800 },
  { name: "Inbox", role: "Watches DMs and comments", x: 910, y: 800 },
];
export const ZONES = [
  { label: "RESEARCH", x: 20, y: 130, w: 330, h: 450, colour: "#38bdf8" },
  { label: "ADS", x: 650, y: 130, w: 330, h: 450, colour: "#fb923c" },
  { label: "CLIENT CARE", x: 20, y: 620, w: 420, h: 280, colour: "#f472b6" },
  { label: "MARKETING (Serena)", x: 455, y: 620, w: 525, h: 280, colour: "#facc15" },
  { label: "WEBSITE", x: 20, y: 930, w: 960, h: 230, colour: "#a78bfa" },
  { label: "FUNDS", x: 20, y: 1190, w: 960, h: 230, colour: "#34d399" },
];
export const BRAIN = { x: 500, y: 290 };
export const COLOUR = { manager: "#34d399", worker: "#38bdf8", reviewer: "#fbbf24" } as const;

/** Each team has its own colour: shirts, screens, desk lights and the floor zone all use it. */
export const TEAM_COLOUR = {
  research: "#38bdf8",
  ads: "#fb923c",
  website: "#a78bfa",
  care: "#f472b6",
  marketing: "#facc15",
  funds: "#34d399",
} as const;
const TEAM_OF: Record<string, keyof typeof TEAM_COLOUR> = {
  lead: "research", scout: "research", trends: "research", analyst: "research", voice: "research", reviews: "research", timing: "research", checker: "research",
  adslead: "ads", maker: "ads", numbers: "ads", copy: "ads", photos: "ads", budget: "ads", judge: "ads",
  web: "website", sitehealth: "website", rank: "website", seo: "website", local: "website",
  fin: "funds", cash: "funds", invoices: "funds", spend: "funds", profit: "funds",
};
export function teamColour(key: string) {
  return TEAM_COLOUR[TEAM_OF[key] ?? "research"];
}
/** A line only appears while something was really handed across in the last half hour. */
export const LIVE_MS = 30 * 60 * 1000;
export const RECENT_MS = 3 * 3600 * 1000;

export type Edge = { from: string; to: string };
export const EDGES: Edge[] = [
  { from: "scout", to: "brain" },
  { from: "analyst", to: "brain" },
  { from: "voice", to: "brain" },
  { from: "timing", to: "brain" },
  { from: "numbers", to: "brain" },
  { from: "maker", to: "brain" },
  { from: "checker", to: "brain" },
  { from: "lead", to: "brain" },
  { from: "scout", to: "checker" },
  { from: "analyst", to: "checker" },
  { from: "voice", to: "checker" },
  { from: "checker", to: "lead" },
  { from: "trends", to: "brain" },
  { from: "reviews", to: "brain" },
  { from: "trends", to: "checker" },
  { from: "reviews", to: "checker" },
  { from: "copy", to: "brain" },
  { from: "photos", to: "copy" },
  { from: "copy", to: "maker" },
  { from: "judge", to: "brain" },
  { from: "judge", to: "lead" },
  { from: "budget", to: "lead" },
  { from: "budget", to: "numbers" },
  { from: "maker", to: "adslead" },
  { from: "numbers", to: "adslead" },
  { from: "copy", to: "adslead" },
  { from: "photos", to: "adslead" },
  { from: "budget", to: "adslead" },
  { from: "judge", to: "adslead" },
  { from: "sitehealth", to: "web" },
  { from: "rank", to: "web" },
  { from: "seo", to: "web" },
  { from: "local", to: "web" },
  { from: "seo", to: "rank" },
  { from: "web", to: "brain" },
  { from: "adslead", to: "brain" },
];

export function pt(key: string) {
  return key === "brain" ? BRAIN : POS[key];
}

/** Hand-offs that really happened in the last half hour, newest first, one per pair. */
export function liveLinks(events: TeamEvent[]) {
  const now = Date.now();
  const seen = new Set<string>();
  const out: { from: string; to: string }[] = [];
  const add = (from: string, to: string) => {
    const k = `${from}>${to}`;
    if (seen.has(k) || from === to) return;
    seen.add(k);
    out.push({ from, to });
  };
  for (const e of events) {
    if (now - new Date(e.created_at).getTime() > LIVE_MS) continue;
    if (e.to_agent_key) add(e.agent_key, e.to_agent_key);
    else if (e.kind === "finding") add(e.agent_key, "brain");
    if (e.kind === "review") add("checker", "brain");
  }
  return out.filter((l) => pt(l.from) && pt(l.to));
}

export function status(a: TeamAgent) {
  const fresh = a.last_run_at && Date.now() - new Date(a.last_run_at).getTime() < 45 * 60000;
  if (a.status === "working" && fresh) return "working" as const;
  if (a.status === "error") return "error" as const;
  return "idle" as const;
}

function Robot({ a }: { a: TeamAgent }) {
  const p = POS[a.key];
  if (!p) return null;
  const st = status(a);
  const c = teamColour(a.key);
  const eye = st === "error" ? "#f43f5e" : st === "working" ? c : "#52525b";
  const big = a.role === "manager";
  const s = big ? 1.25 : 1;
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s})`}>
      {/* desk */}
      <rect x="-62" y="26" width="124" height="22" rx="6" fill="#18181b" stroke={c} strokeOpacity={st === "working" ? 0.9 : 0.3} />
      <rect x="-40" y="31" width="80" height="6" rx="3" fill={c} opacity={st === "working" ? 0.55 : 0.12} />
      {st === "working" ? <circle cx="0" cy="-6" r="34" fill={c} opacity="0.12" className="tf-pulse" /> : null}
      {/* robot */}
      <line x1="0" y1="-30" x2="0" y2="-22" stroke={c} strokeWidth="2" opacity="0.8" />
      <circle cx="0" cy="-33" r="3.5" fill={st === "working" ? c : "#3f3f46"} />
      <rect x="-19" y="-22" width="38" height="30" rx="10" fill="#27272a" stroke={c} strokeOpacity="0.7" strokeWidth="1.5" />
      <circle cx="-7" cy="-8" r="4.5" fill={eye} className={st === "working" ? "tf-blink" : undefined} />
      <circle cx="7" cy="-8" r="4.5" fill={eye} className={st === "working" ? "tf-blink" : undefined} />
      <rect x="-13" y="10" width="26" height="14" rx="5" fill="#27272a" stroke={c} strokeOpacity="0.5" />
      {/* label */}
      <text x="0" y="68" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fafafa">
        {a.name}
      </text>
      <text x="0" y="84" textAnchor="middle" fontSize="11" fill={st === "working" ? c : st === "error" ? "#fb7185" : "#a1a1aa"}>
        {st === "working" ? (a.current_task ? a.current_task.slice(0, 34) : "Working") : st === "error" ? "Needs a look" : "Idle"}
      </text>
    </g>
  );
}

function OpenDesk({ d }: { d: (typeof PLANNED)[number] }) {
  return (
    <g transform={`translate(${d.x} ${d.y})`} opacity="0.85">
      <rect x="-62" y="26" width="124" height="22" rx="6" fill="none" stroke="#52525b" strokeDasharray="4 4" />
      <rect x="-19" y="-22" width="38" height="30" rx="10" fill="none" stroke="#52525b" strokeDasharray="4 4" />
      <circle cx="-7" cy="-8" r="3" fill="none" stroke="#52525b" />
      <circle cx="7" cy="-8" r="3" fill="none" stroke="#52525b" />
      <text x="0" y="68" textAnchor="middle" fontSize="12" fontWeight="600" fill="#a1a1aa">
        {d.name}
      </text>
      <text x="0" y="83" textAnchor="middle" fontSize="10" fill="#71717a">
        {d.role}
      </text>
    </g>
  );
}

function Brain({ count }: { count: number }) {
  return (
    <g transform={`translate(${BRAIN.x} ${BRAIN.y})`}>
      <circle r="104" fill="url(#tf-brainglow)" />
      <g filter="url(#tf-glow)" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M-6 -62 C-44 -72 -78 -48 -72 -16 C-92 -2 -86 36 -58 42 C-52 66 -18 72 -6 52" />
        <path d="M6 -62 C44 -72 78 -48 72 -16 C92 -2 86 36 58 42 C52 66 18 72 6 52" />
        <path d="M-6 -62 L-6 52 M6 -62 L6 52" strokeOpacity="0.5" />
        <path d="M-54 -34 C-36 -26 -30 -42 -14 -30 M-60 6 C-42 -2 -34 16 -14 8 M-40 36 C-28 26 -22 40 -10 32" strokeOpacity="0.8" />
        <path d="M54 -34 C36 -26 30 -42 14 -30 M60 6 C42 -2 34 16 14 8 M40 36 C28 26 22 40 10 32" strokeOpacity="0.8" />
      </g>
      <text y="96" textAnchor="middle" fontSize="12" letterSpacing="2" fill="#6ee7b7" fontWeight="600">
        LEARNING BRAIN
      </text>
      <text y="114" textAnchor="middle" fontSize="12" fill="#a1a1aa">
        {count} findings
      </text>
    </g>
  );
}

export function TeamFloor({ agents, events, learnings }: { agents: TeamAgent[]; events: TeamEvent[]; learnings: number }) {
  const live = liveLinks(events);
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-zinc-950 to-zinc-900">
      <style>{`
        @keyframes tf-dash { to { stroke-dashoffset: -28; } }
        @keyframes tf-pulse { 0%,100% { opacity: .08; transform: scale(.92); } 50% { opacity: .22; transform: scale(1.06); } }
        @keyframes tf-blink { 0%,92%,100% { transform: scaleY(1); } 96% { transform: scaleY(.15); } }
        .tf-flow { stroke-dasharray: 6 8; animation: tf-dash 1.1s linear infinite; }
        .tf-pulse { transform-box: fill-box; transform-origin: center; animation: tf-pulse 2.2s ease-in-out infinite; }
        .tf-blink { transform-box: fill-box; transform-origin: center; animation: tf-blink 3.6s infinite; }
      `}</style>
      <svg viewBox="0 0 1000 1450" className="block h-auto w-full" role="img" aria-label="Research team floor">
        <defs>
          <pattern id="tf-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#34d399" strokeOpacity="0.07" />
          </pattern>
          <radialGradient id="tf-fade" cx="50%" cy="48%" r="60%">
            <stop offset="0" stopColor="#34d399" stopOpacity="0.1" />
            <stop offset="1" stopColor="#09090b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tf-brainglow">
            <stop offset="0" stopColor="#34d399" stopOpacity="0.28" />
            <stop offset="1" stopColor="#34d399" stopOpacity="0" />
          </radialGradient>
          <filter id="tf-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="1000" height="1450" fill="url(#tf-grid)" />
        <rect width="1000" height="1450" fill="url(#tf-fade)" />

        {ZONES.map((z) => (
          <g key={z.label}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="16" fill={z.colour} fillOpacity="0.04" stroke={z.colour} strokeOpacity="0.3" strokeDasharray="6 6" />
            <text x={z.x + 16} y={z.y + 24} fontSize="11" letterSpacing="2" fill={z.colour} opacity="0.9">
              {z.label}
            </text>
          </g>
        ))}

        {live.map((e) => {
          const a = pt(e.from);
          const b = pt(e.to);
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={teamColour(e.from)}
              strokeOpacity={0.95}
              strokeWidth={2.5}
              className="tf-flow"
              filter="url(#tf-glow)"
            />
          );
        })}

        <Brain count={learnings} />
        {PLANNED.map((d) => (
          <OpenDesk key={d.name} d={d} />
        ))}
        {agents.map((a) => (
          <Robot key={a.key} a={a} />
        ))}

        <g fontSize="11" fill="#a1a1aa">
          <circle cx="24" cy="834" r="4" fill="#34d399" />
          <text x="34" y="838">Working, or something handed over in the last 3 hours</text>
          <circle cx="400" cy="834" r="4" fill="#52525b" />
          <text x="410" y="838">Idle</text><circle cx="470" cy="834" r="4" fill="none" stroke="#52525b" /><text x="480" y="838">Open desk (planned, not built yet)</text>
          <circle cx="720" cy="834" r="4" fill="#f43f5e" />
          <text x="730" y="838">Needs a look</text>
        </g>
      </svg>
    </div>
  );
}
