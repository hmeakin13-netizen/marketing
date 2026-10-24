"use client";

import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TeamAgent, TeamEvent } from "@/lib/staff/admaker";
import { liveLinks, status, teamColour } from "@/components/staff/TeamFloor";

/**
 * The team as a round office around the brand brain. Each team has its own coloured sector, its manager
 * sits on a raised executive desk on the inner ring, and the workers sit on the outer ring facing the brain.
 * People type while their agent is really working and sleep on the desk when it is not. A line only appears
 * for a hand-off that really happened in the last half hour. Everything is driven by the same rows as the flat map.
 */

const SKIN = ["#f1c9a5", "#d9a47e", "#b97d56", "#8d5a3b", "#f5d6bb", "#c68b63"];
const HAIR = ["#1f1a17", "#3b2a1d", "#6b4a2b", "#b88a4a", "#2b2b33", "#7a3e2c"];

const R_WORK = 11.8; // workers
const R_MGR = 6.6; // managers
const R_FLOOR = 15.2;
const GAP = (6 * Math.PI) / 180;

type Seat = { id: string; name: string; x: number; z: number; yaw: number; colour: string; manager: boolean; agentKey?: string };
type Sector = { id: string; label: string; colour: string; start: number; end: number; mid: number };

const TEAMS: { id: string; label: string; colour: string; manager: { key?: string; name: string }; members: { key?: string; name: string }[] }[] = [
  { id: "research", label: "RESEARCH", colour: "#38bdf8", manager: { key: "lead", name: "Research Lead" }, members: ["scout", "trends", "analyst", "voice", "reviews", "timing", "checker", "curious"].map((k) => ({ key: k, name: k })) },
  { id: "ads", label: "ADS", colour: "#fb923c", manager: { key: "adslead", name: "Ads Lead" }, members: ["maker", "numbers", "copy", "photos", "budget", "judge", "operator"].map((k) => ({ key: k, name: k })) },
  { id: "website", label: "WEBSITE", colour: "#a78bfa", manager: { key: "web", name: "Web Lead" }, members: ["sitehealth", "rank", "seo", "local"].map((k) => ({ key: k, name: k })) },
  { id: "funds", label: "FUNDS", colour: "#34d399", manager: { key: "fin", name: "Finance Lead" }, members: ["cash", "invoices", "spend", "profit"].map((k) => ({ key: k, name: k })) },
  {
    id: "marketing",
    label: "MARKETING (SERENA)",
    colour: "#facc15",
    manager: { name: "Marketing Lead" },
    members: [{ name: "Content Planner" }, { name: "Caption Writer" }, { name: "Publisher" }, { name: "Inbox" }],
  },
  {
    id: "care",
    label: "CLIENT CARE",
    colour: "#f472b6",
    manager: { key: "carelead", name: "Care Lead" },
    members: [{ key: "checkin", name: "Client Check-in" }, { key: "reports", name: "Report Writer" }, { key: "videos", name: "Video Requester" }],
  },
  {
    id: "sales",
    label: "SALES RECOVERY",
    colour: "#ef4444",
    manager: { key: "saleslead", name: "Sales Lead" },
    members: [{ key: "noshow", name: "No-show Matcher" }, { key: "chaser", name: "Follow-up Chaser" }, { key: "syncer", name: "Stage Syncer" }, { key: "booster", name: "Call Booster" }],
  },
];

/** Where everyone sits. Angles run counter-clockwise from the back of the room; (x, z) = (r cos a, -r sin a). */
function layout(agents: TeamAgent[]) {
  const byKey = Object.fromEntries(agents.map((a) => [a.key, a]));
  const total = TEAMS.reduce((n, t) => n + t.members.length, 0);
  const usable = Math.PI * 2 - GAP * TEAMS.length;
  const seats: Seat[] = [];
  const sectors: Sector[] = [];
  let a0 = Math.PI * 0.5 - (usable * (TEAMS[0].members.length / total)) / 2; // research centred at the back
  for (const t of TEAMS) {
    const span = usable * (t.members.length / total);
    const start = a0;
    const end = a0 + span;
    const mid = (start + end) / 2;
    sectors.push({ id: t.id, label: t.label, colour: t.colour, start, end, mid });
    const place = (r: number, ang: number) => {
      const x = r * Math.cos(ang);
      const z = -r * Math.sin(ang);
      return { x, z, yaw: Math.atan2(-x, -z) }; // face the brain
    };
    const mp = place(R_MGR, mid);
    const mAgent = t.manager.key ? byKey[t.manager.key] : undefined;
    seats.push({ id: `${t.id}-mgr`, name: mAgent?.name ?? t.manager.name, ...mp, colour: t.colour, manager: true, agentKey: mAgent?.key });
    t.members.forEach((m, i) => {
      const ang = start + ((i + 0.5) / t.members.length) * span;
      const ag = m.key ? byKey[m.key] : undefined;
      seats.push({ id: `${t.id}-${m.key ?? m.name}`, name: ag?.name ?? m.name, ...place(R_WORK, ang), colour: t.colour, manager: false, agentKey: ag?.key });
    });
    a0 = end + GAP;
  }
  return { seats, sectors };
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Label({ name, line, colour, y, big }: { name: string; line: string; colour: string; y: number; big?: boolean }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={big ? 15 : 13} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ textAlign: "center", whiteSpace: "nowrap", background: "rgba(9,9,11,0.72)", border: `1px solid ${colour}55`, borderRadius: 8, padding: "3px 9px" }}>
        <div style={{ fontSize: big ? 15 : 13, fontWeight: 700, color: "#fafafa" }}>{name}</div>
        <div style={{ fontSize: 11, color: colour }}>{line}</div>
      </div>
    </Html>
  );
}

function Zzz() {
  return (
    <Html position={[0.3, 0.5, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
      <div className="tf3-zzz" aria-hidden>
        <span>z</span>
        <span>z</span>
        <span>Z</span>
      </div>
    </Html>
  );
}

function Person({ seat, agent }: { seat: Seat; agent?: TeamAgent }) {
  const st = agent ? status(agent) : ("open" as const);
  const colour = seat.colour;
  const h = hash(seat.id);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const mgr = seat.manager;
  const w = mgr ? 2.7 : 1.9;

  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const gem = useRef<THREE.Mesh>(null);
  const sleep = useRef(st === "working" || st === "error" ? 0 : 1);
  const phase = (h % 100) / 10;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime + phase;
    if (gem.current) gem.current.rotation.y = t * 1.2;
    if (st === "open") return;
    const target = st === "working" || st === "error" ? 0 : 1;
    sleep.current += (target - sleep.current) * Math.min(1, dt * 2.5);
    const s = sleep.current;
    const awake = 1 - s;
    if (torso.current) torso.current.rotation.x = s * 0.75 + awake * Math.sin(t * 1.3) * 0.02;
    if (head.current) {
      head.current.rotation.x = s * 0.55 + awake * (Math.sin(t * 2.1) * 0.06 - 0.08);
      head.current.rotation.z = s * 0.12;
      head.current.position.y = 1.18 - s * 0.05;
    }
    const reach = -1.05 - s * 0.35;
    if (armL.current) armL.current.rotation.x = reach;
    if (armR.current) armR.current.rotation.x = reach;
    const type = awake * (st === "error" ? 0.1 : 1);
    if (foreL.current) foreL.current.rotation.x = 0.15 + Math.sin(t * 9) * 0.35 * type;
    if (foreR.current) foreR.current.rotation.x = 0.15 + Math.sin(t * 9 + 2.1) * 0.35 * type;
    if (screen.current) {
      screen.current.emissiveIntensity = st === "working" ? 0.9 + Math.sin(t * 6) * 0.12 : st === "error" ? 0.8 + Math.sin(t * 10) * 0.2 : 0.04;
    }
  });

  const screenColour = st === "error" ? "#f43f5e" : colour;
  const line = st === "open" ? "Open desk" : st === "working" ? (agent?.current_task ? agent.current_task.slice(0, 30) : "Working") : st === "error" ? "Needs a look" : "Asleep";
  const ghost = st === "open";
  const sc = mgr ? 1.12 : 1;
  const lift = mgr ? 0.1 : 0;

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.yaw, 0]} scale={sc}>
      {mgr ? (
        <>
          <mesh position={[0, 0.05, -0.2]} receiveShadow>
            <boxGeometry args={[3.7, 0.1, 3.1]} />
            <meshStandardMaterial color="#14141a" />
          </mesh>
          <mesh position={[0, 0.11, -0.2]}>
            <boxGeometry args={[3.74, 0.02, 3.14]} />
            <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={ghost ? 0.15 : 0.7} />
          </mesh>
        </>
      ) : null}

      {/* desk, seen from the person's seat: the monitor faces them */}
      <group position={[0, lift, 0]}>
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.08, 0.95]} />
          <meshStandardMaterial color={mgr ? "#4a3b2a" : "#3a3a44"} roughness={0.5} transparent={ghost} opacity={ghost ? 0.7 : 1} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * (w / 2 - 0.08), 0.36, 0]}>
            <boxGeometry args={[0.08, 0.72, 0.85]} />
            <meshStandardMaterial color="#26262d" transparent={ghost} opacity={ghost ? 0.6 : 1} />
          </mesh>
        ))}
        <mesh position={[0, 0.725, 0.46]}>
          <boxGeometry args={[w, 0.02, 0.03]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={st === "working" ? 1 : 0.18} />
        </mesh>
        {!ghost ? (
          <>
            <mesh position={[0, 1.06, 0.2]} castShadow>
              <boxGeometry args={[0.92, 0.56, 0.05]} />
              <meshStandardMaterial color="#17171c" />
            </mesh>
            <mesh position={[0, 1.06, 0.172]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.86, 0.5]} />
              <meshStandardMaterial ref={screen} color="#0b0b0f" emissive={screenColour} emissiveIntensity={0.05} />
            </mesh>
            {mgr ? (
              <mesh position={[0.95, 1.0, 0.25]} rotation={[0, -0.3, 0]}>
                <boxGeometry args={[0.6, 0.4, 0.04]} />
                <meshStandardMaterial color="#17171c" emissive={screenColour} emissiveIntensity={st === "working" ? 0.5 : 0.03} />
              </mesh>
            ) : null}
            <mesh position={[0, 0.8, 0.2]}>
              <cylinderGeometry args={[0.05, 0.08, 0.15, 8]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0, 0.78, -0.12]}>
              <boxGeometry args={[0.6, 0.03, 0.2]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          </>
        ) : null}
      </group>

      {/* chair and person */}
      <group position={[0, lift, 0]}>
        <mesh position={[0, 0.45, -0.75]} castShadow>
          <boxGeometry args={[0.7, 0.1, 0.6]} />
          <meshStandardMaterial color={mgr ? "#1f2937" : "#2a2a32"} transparent={ghost} opacity={ghost ? 0.6 : 1} />
        </mesh>
        <mesh position={[0, mgr ? 1.05 : 0.95, -1.05]}>
          <boxGeometry args={[0.7, mgr ? 1.1 : 0.9, 0.08]} />
          <meshStandardMaterial color={mgr ? "#1f2937" : "#2a2a32"} transparent={ghost} opacity={ghost ? 0.6 : 1} />
        </mesh>
        <mesh position={[0, 0.22, -0.75]}>
          <cylinderGeometry args={[0.04, 0.04, 0.45, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        {!ghost ? (
          <group position={[0, 0.5, -0.72]}>
            <group ref={torso} position={[0, 0.2, 0]}>
              <mesh position={[0, 0.35, 0]} castShadow>
                <boxGeometry args={[0.62, 0.78, 0.34]} />
                <meshStandardMaterial color={mgr ? "#e5e7eb" : colour} roughness={0.7} />
              </mesh>
              {mgr ? (
                <>
                  <mesh position={[0, 0.3, 0]}>
                    <boxGeometry args={[0.66, 0.5, 0.38]} />
                    <meshStandardMaterial color="#111827" roughness={0.7} />
                  </mesh>
                  <mesh position={[0, 0.5, 0.18]}>
                    <boxGeometry args={[0.1, 0.5, 0.02]} />
                    <meshStandardMaterial color={colour} />
                  </mesh>
                </>
              ) : null}
              <group ref={head} position={[0, 1.18, 0]}>
                <mesh castShadow>
                  <sphereGeometry args={[0.27, 20, 16]} />
                  <meshStandardMaterial color={skin} roughness={0.8} />
                </mesh>
                <mesh position={[0, 0.07, -0.03]}>
                  <sphereGeometry args={[0.285, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
                  <meshStandardMaterial color={hair} roughness={0.9} />
                </mesh>
                {st === "idle" ? (
                  <>
                    <mesh position={[-0.09, 0.02, 0.255]}><boxGeometry args={[0.08, 0.012, 0.01]} /><meshBasicMaterial color="#222" /></mesh>
                    <mesh position={[0.09, 0.02, 0.255]}><boxGeometry args={[0.08, 0.012, 0.01]} /><meshBasicMaterial color="#222" /></mesh>
                  </>
                ) : (
                  <>
                    <mesh position={[-0.09, 0.03, 0.255]}><sphereGeometry args={[0.028, 8, 8]} /><meshBasicMaterial color={st === "error" ? "#f43f5e" : "#111"} /></mesh>
                    <mesh position={[0.09, 0.03, 0.255]}><sphereGeometry args={[0.028, 8, 8]} /><meshBasicMaterial color={st === "error" ? "#f43f5e" : "#111"} /></mesh>
                  </>
                )}
                {st === "idle" ? <Zzz /> : null}
              </group>
              {[-1, 1].map((sd) => (
                <group key={sd} ref={sd < 0 ? armL : armR} position={[sd * 0.4, 0.62, 0]}>
                  <mesh position={[0, -0.22, 0]} castShadow>
                    <boxGeometry args={[0.16, 0.44, 0.16]} />
                    <meshStandardMaterial color={mgr ? "#111827" : colour} roughness={0.7} />
                  </mesh>
                  <group ref={sd < 0 ? foreL : foreR} position={[0, -0.44, 0]}>
                    <mesh position={[0, -0.2, 0]} castShadow>
                      <boxGeometry args={[0.13, 0.4, 0.13]} />
                      <meshStandardMaterial color={skin} roughness={0.8} />
                    </mesh>
                  </group>
                </group>
              ))}
            </group>
          </group>
        ) : null}
      </group>

      {mgr && !ghost ? (
        <mesh ref={gem} position={[0, 3.1, -0.7]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={1} />
        </mesh>
      ) : null}
      <group rotation={[0, -seat.yaw, 0]}>
        <Label name={seat.name} line={line} colour={ghost ? "#a1a1aa" : st === "error" ? "#fb7185" : colour} y={mgr ? 3.9 : 2.7} big={mgr} />
      </group>
    </group>
  );
}

function Brain({ learnings, active }: { learnings: number; active: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.4;
      core.current.rotation.x = t * 0.25;
      core.current.scale.setScalar(1 + Math.sin(t * (active ? 3 : 1.2)) * 0.05);
    }
    if (ring.current) ring.current.rotation.z = t * 0.5;
    if (ring2.current) ring2.current.rotation.z = -t * 0.35;
  });
  return (
    <group>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <cylinderGeometry args={[2.6, 2.8, 0.3, 48]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[1.5, 1.7, 0.2, 40]} />
        <meshStandardMaterial color="#064e3b" emissive="#34d399" emissiveIntensity={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <ringGeometry args={[2.45, 2.6, 64]} />
        <meshBasicMaterial color="#6ee7b7" />
      </mesh>
      <group position={[0, 2.6, 0]}>
        <mesh ref={core}>
          <icosahedronGeometry args={[0.95, 1]} />
          <meshStandardMaterial color="#064e3b" emissive="#34d399" emissiveIntensity={active ? 1.2 : 0.6} wireframe />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.6, 1]} />
          <meshStandardMaterial color="#10b981" emissive="#34d399" emissiveIntensity={0.95} />
        </mesh>
        <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[1.4, 0.02, 8, 80]} />
          <meshBasicMaterial color="#6ee7b7" />
        </mesh>
        <mesh ref={ring2} rotation={[Math.PI / 1.7, 0.4, 0]}>
          <torusGeometry args={[1.75, 0.015, 8, 80]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.6} />
        </mesh>
        <pointLight color="#34d399" intensity={active ? 14 : 8} distance={16} />
      </group>
      <Html position={[0, 0.9, 2.9]} center distanceFactor={15} style={{ pointerEvents: "none" }}>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", background: "rgba(9,9,11,0.72)", border: "1px solid #34d39966", borderRadius: 8, padding: "3px 10px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#6ee7b7" }}>Brand brain</div>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>{learnings} learnings</div>
        </div>
      </Html>
    </group>
  );
}

function Pulse({ curve, colour }: { curve: THREE.QuadraticBezierCurve3; colour: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = (state.clock.elapsedTime * 0.45) % 1;
    if (ref.current) ref.current.position.copy(curve.getPoint(t));
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.2, 12, 12]} />
      <meshBasicMaterial color={colour} />
    </mesh>
  );
}

/** Only hand-offs that really happened in the last half hour get a line, with a spark travelling along it. */
function Links({ events, spots }: { events: TeamEvent[]; spots: Record<string, { x: number; z: number }> }) {
  const live = useMemo(() => liveLinks(events), [events]);
  const point = (k: string): [number, number, number] => (k === "brain" ? [0, 2.6, 0] : [spots[k].x, 2.0, spots[k].z]);
  return (
    <>
      {live
        .filter((e) => (e.to === "brain" || spots[e.to]) && (e.from === "brain" || spots[e.from]))
        .map((e) => {
          const a = point(e.from);
          const b = point(e.to);
          const mid: [number, number, number] = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 2.2, (a[2] + b[2]) / 2];
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b));
          const colour = teamColour(e.from);
          return (
            <group key={`${e.from}-${e.to}`}>
              <Line points={curve.getPoints(32)} color={colour} lineWidth={2.4} transparent opacity={0.9} />
              <Pulse curve={curve} colour={colour} />
            </group>
          );
        })}
    </>
  );
}

function Room({ sectors }: { sectors: Sector[] }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[R_FLOOR + 4, 96]} />
        <meshStandardMaterial color="#07080b" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R_FLOOR, 96]} />
        <meshStandardMaterial color="#101218" roughness={0.55} metalness={0.2} />
      </mesh>
      {[4.2, 9.2].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[r, r + 0.04, 96]} />
          <meshBasicMaterial color="#27272a" />
        </mesh>
      ))}
      {sectors.map((s) => (
        <group key={s.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[3.2, R_FLOOR - 0.4, 48, 1, s.start, s.end - s.start]} />
            <meshStandardMaterial color={s.colour} transparent opacity={0.1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[R_FLOOR - 0.5, R_FLOOR - 0.35, 48, 1, s.start, s.end - s.start]} />
            <meshBasicMaterial color={s.colour} />
          </mesh>
          <Html position={[(R_FLOOR + 1.8) * Math.cos(s.mid), 0.6, -(R_FLOOR + 1.8) * Math.sin(s.mid)]} center distanceFactor={16} style={{ pointerEvents: "none" }}>
            <div style={{ fontSize: 14, letterSpacing: 3, fontWeight: 700, color: s.colour, whiteSpace: "nowrap", textShadow: "0 1px 4px #000" }}>{s.label}</div>
          </Html>
        </group>
      ))}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[R_FLOOR, R_FLOOR, 0.6, 96, 1, true]} />
        <meshStandardMaterial color="#1a1c24" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.62, 0]}>
        <ringGeometry args={[R_FLOOR - 0.06, R_FLOOR + 0.06, 96]} />
        <meshBasicMaterial color="#3f3f46" />
      </mesh>
    </>
  );
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function TeamFloor3D({
  agents,
  events,
  learnings,
  fallback,
}: {
  agents: TeamAgent[];
  events: TeamEvent[];
  learnings: number;
  fallback: ReactNode;
}) {
  const { seats, sectors } = useMemo(() => layout(agents), [agents]);
  const byKey = useMemo(() => Object.fromEntries(agents.map((a) => [a.key, a])), [agents]);
  const spots = useMemo(() => Object.fromEntries(seats.filter((s) => s.agentKey).map((s) => [s.agentKey as string, { x: s.x, z: s.z }])), [seats]);
  const anyWorking = agents.some((a) => status(a) === "working");
  const [spin, setSpin] = useState(true);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Boundary fallback={fallback}>
      <div className="relative h-[540px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 sm:h-[820px]">
        <style>{`
          .tf3-zzz { display:flex; gap:4px; font-weight:700; color:#93c5fd; font-size:18px; }
          .tf3-zzz span { animation: tf3-float 2.4s ease-in-out infinite; opacity:0; }
          .tf3-zzz span:nth-child(2) { animation-delay: .6s; font-size:22px; }
          .tf3-zzz span:nth-child(3) { animation-delay: 1.2s; font-size:28px; }
          @keyframes tf3-float { 0% { transform: translateY(8px); opacity:0 } 30% { opacity:.9 } 100% { transform: translateY(-22px); opacity:0 } }
        `}</style>
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 27, 30], fov: 42 }} gl={{ antialias: true }}>
          <color attach="background" args={["#08080b"]} />
          <fog attach="fog" args={["#08080b", 48, 90]} />
          <hemisphereLight args={["#cbd5e1", "#0b0b10", 0.75]} />
          <directionalLight position={[10, 22, 12]} intensity={1.0} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
          <Room sectors={sectors} />
          <Links events={events} spots={spots} />
          <Brain learnings={learnings} active={anyWorking} />
          {seats.map((s) => (
            <Person key={s.id} seat={s} agent={s.agentKey ? byKey[s.agentKey] : undefined} />
          ))}
          <OrbitControls
            enablePan={false}
            target={[0, 0.5, 0]}
            minDistance={9}
            maxDistance={52}
            minPolarAngle={0.35}
            maxPolarAngle={1.4}
            autoRotate={spin}
            autoRotateSpeed={0.35}
            onStart={() => {
              setSpin(false);
              if (resume.current) clearTimeout(resume.current);
            }}
            onEnd={() => {
              if (resume.current) clearTimeout(resume.current);
              resume.current = setTimeout(() => setSpin(true), 12000);
            }}
          />
        </Canvas>
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-500">Drag to look around · scroll to zoom · managers sit on the raised desks</div>
      </div>
    </Boundary>
  );
}
