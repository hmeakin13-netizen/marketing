"use client";

import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TeamAgent, TeamEvent } from "@/lib/staff/admaker";
import { liveLinks, status, teamColour } from "@/components/staff/TeamFloor";

/**
 * The team as a round office around the brand brain. Each team has its own coloured sector with a signature
 * piece of kit behind it, its manager sits on a raised executive desk on the inner ring, and the workers sit
 * on the outer ring facing the brain. Every desk carries a beacon you can read from across the room: green
 * and pulsing while the agent is really working, red when it needs a look, a dim blue ember while it sleeps.
 * The sector signs count who is awake. Everything is driven by the same rows as the flat map.
 */

const SKIN = ["#f1c9a5", "#d9a47e", "#b97d56", "#8d5a3b", "#f5d6bb", "#c68b63"];
const HAIR = ["#1f1a17", "#3b2a1d", "#6b4a2b", "#b88a4a", "#2b2b33", "#7a3e2c"];

const R_WORK = 11.8; // workers
const R_MGR = 6.6; // managers
const R_PROP = 14.2; // the team's signature kit, behind the workers
const R_FLOOR = 15.6;
const GAP = (6 * Math.PI) / 180;

const AWAKE = "#22c55e";
const ERROR = "#f43f5e";
const ASLEEP = "#3b82f6";

type St = "working" | "error" | "idle" | "open";
type Seat = { id: string; name: string; x: number; z: number; yaw: number; colour: string; manager: boolean; agentKey?: string };
type Sector = { id: string; label: string; colour: string; start: number; end: number; mid: number };

const TEAMS: { id: string; label: string; colour: string; manager: { key?: string; name: string }; members: { key?: string; name: string }[] }[] = [
  { id: "research", label: "RESEARCH", colour: "#38bdf8", manager: { key: "lead", name: "Research Lead" }, members: ["scout", "trends", "analyst", "voice", "reviews", "timing", "checker", "curious"].map((k) => ({ key: k, name: k })) },
  { id: "ads", label: "ADS", colour: "#fb923c", manager: { key: "adslead", name: "Ads Lead" }, members: ["maker", "numbers", "copy", "photos", "budget", "judge", "operator", "compliance"].map((k) => ({ key: k, name: k })) },
  { id: "website", label: "WEBSITE", colour: "#a78bfa", manager: { key: "web", name: "Web Lead" }, members: ["sitehealth", "rank", "seo", "local"].map((k) => ({ key: k, name: k })) },
  { id: "funds", label: "FUNDS", colour: "#34d399", manager: { key: "fin", name: "Finance Lead" }, members: ["cash", "invoices", "spend", "profit"].map((k) => ({ key: k, name: k })) },
  {
    id: "marketing",
    label: "MARKETING (SERENA)",
    colour: "#facc15",
    manager: { key: "mktlead", name: "Marketing Lead" },
    members: [{ key: "planner", name: "Content Planner" }, { key: "captions", name: "Caption Writer" }, { key: "scripts", name: "Reel Scriptwriter" }, { key: "publisher", name: "Publisher" }, { key: "inbox", name: "Inbox Watcher" }, { key: "postwatch", name: "Post Analyst" }, { key: "mktscout", name: "Social Competitor Analyst" }, { key: "visuals", name: "Visual and Video Creator" }],
  },
  {
    id: "care",
    label: "CLIENT CARE",
    colour: "#f472b6",
    manager: { key: "carelead", name: "Care Lead" },
    members: [{ key: "checkin", name: "Client Check-in" }, { key: "reports", name: "Report Writer" }, { key: "videos", name: "Video Requester" }, { key: "referrals", name: "Referral Asker" }, { key: "outcomes", name: "Outcome Chaser" }],
  },
  {
    id: "sales",
    label: "SALES RECOVERY",
    colour: "#ef4444",
    manager: { key: "saleslead", name: "Sales Lead" },
    members: [{ key: "replies", name: "Reply Handler" }, { key: "noshow", name: "No-show Matcher" }, { key: "chaser", name: "Follow-up Chaser" }, { key: "syncer", name: "Stage Syncer" }, { key: "ticker", name: "Task Ticker" }, { key: "booster", name: "Call Booster" }],
  },
  {
    id: "ops",
    label: "OPS",
    colour: "#94a3b8",
    manager: { key: "ops", name: "Ops Auditor" },
    members: [{ key: "taskset", name: "Task Setter" }, { key: "backlog", name: "Backlog Answerer" }, { key: "briefing", name: "Morning Briefing" }],
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

function Label({ name, line, colour, y, big, st }: { name: string; line: string; colour: string; y: number; big?: boolean; st: St }) {
  const dot = st === "working" ? AWAKE : st === "error" ? ERROR : st === "idle" ? ASLEEP : "#52525b";
  return (
    <Html position={[0, y, 0]} center distanceFactor={big ? 15 : 13} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ textAlign: "center", whiteSpace: "nowrap", background: "rgba(9,9,11,0.78)", border: `1px solid ${colour}66`, borderRadius: 8, padding: "3px 9px" }}>
        <div style={{ fontSize: big ? 15 : 13, fontWeight: 700, color: "#fafafa" }}>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: dot, marginRight: 6, boxShadow: st === "working" ? `0 0 8px ${dot}` : "none" }} />
          {name}
        </div>
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

/** The light pole behind every desk: the one thing you can read from the far side of the room. */
function Beacon({ st, phase }: { st: St; phase: number }) {
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const colour = st === "working" ? AWAKE : st === "error" ? ERROR : ASLEEP;
  useFrame((s) => {
    const t = s.clock.elapsedTime + phase;
    const pulse = st === "working" ? 0.75 + Math.sin(t * 3) * 0.25 : st === "error" ? 0.6 + (Math.sin(t * 12) > 0 ? 0.5 : 0) : 0.12;
    if (lamp.current) lamp.current.emissiveIntensity = pulse * 2.2;
    if (light.current) light.current.intensity = st === "idle" ? 0.4 : pulse * 6;
    if (halo.current) {
      const k = st === "working" ? 1 + Math.sin(t * 3) * 0.18 : 1;
      halo.current.scale.setScalar(k);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = st === "working" ? 0.35 + Math.sin(t * 3) * 0.12 : st === "error" ? 0.35 : 0.08;
    }
  });
  if (st === "open") return null;
  return (
    <group position={[0, 0, 0.75]}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 3.2, 8]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      <mesh position={[0, 3.3, 0]}>
        <sphereGeometry args={[0.2, 14, 12]} />
        <meshStandardMaterial ref={lamp} color={colour} emissive={colour} emissiveIntensity={1} />
      </mesh>
      <mesh ref={halo} position={[0, 3.3, 0]}>
        <sphereGeometry args={[0.45, 14, 12]} />
        <meshBasicMaterial color={colour} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[0, 3.3, 0]} color={colour} intensity={2} distance={6} />
    </group>
  );
}

function Person({ seat, agent }: { seat: Seat; agent?: TeamAgent }) {
  const st: St = agent ? status(agent) : "open";
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

  const screenColour = st === "error" ? ERROR : colour;
  const line = st === "open" ? "Open desk" : st === "working" ? (agent?.current_task ? agent.current_task.slice(0, 30) : "Working") : st === "error" ? "Needs a look" : "Asleep";
  const ghost = st === "open";
  const sc = mgr ? 1.12 : 1;
  const lift = mgr ? 0.1 : 0;
  const floor = st === "working" ? AWAKE : st === "error" ? ERROR : ASLEEP;

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.yaw, 0]} scale={sc}>
      {/* status pool under the desk, readable from any distance */}
      {!ghost ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, -0.3]}>
          <circleGeometry args={[1.45, 32]} />
          <meshBasicMaterial color={floor} transparent opacity={st === "idle" ? 0.06 : 0.22} depthWrite={false} />
        </mesh>
      ) : null}
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
          <meshStandardMaterial color={floor} emissive={floor} emissiveIntensity={st === "working" ? 1.2 : st === "error" ? 1 : 0.15} />
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
            {/* a mug and a notepad: small things that make a desk look used */}
            <mesh position={[w / 2 - 0.3, 0.82, 0.1]}>
              <cylinderGeometry args={[0.07, 0.06, 0.12, 10]} />
              <meshStandardMaterial color={(h >> 5) % 2 ? "#e5e7eb" : colour} />
            </mesh>
            <mesh position={[-(w / 2 - 0.35), 0.765, -0.05]} rotation={[0, 0.3, 0]}>
              <boxGeometry args={[0.28, 0.02, 0.36]} />
              <meshStandardMaterial color="#f5f5f4" />
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
                    <mesh position={[-0.09, 0.03, 0.255]}><sphereGeometry args={[0.028, 8, 8]} /><meshBasicMaterial color={st === "error" ? ERROR : "#111"} /></mesh>
                    <mesh position={[0.09, 0.03, 0.255]}><sphereGeometry args={[0.028, 8, 8]} /><meshBasicMaterial color={st === "error" ? ERROR : "#111"} /></mesh>
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

      <Beacon st={st} phase={phase} />

      {mgr && !ghost ? (
        <mesh ref={gem} position={[0, 3.1, -0.7]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={1} />
        </mesh>
      ) : null}
      <group rotation={[0, -seat.yaw, 0]}>
        <Label name={seat.name} line={line} colour={ghost ? "#a1a1aa" : st === "error" ? "#fb7185" : colour} y={mgr ? 3.9 : 2.7} big={mgr} st={st} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Signature kit. Each team gets one piece behind its desks, in its colour, that moves while someone
 * on the team is awake: research has a radar, ads a billboard, website a server rack, funds a vault,
 * marketing a video wall, client care a reception with plants, sales a phone bank and Ops a tower.
 * ------------------------------------------------------------------------------------------------ */

function Radar({ colour, awake }: { colour: string; awake: boolean }) {
  const dish = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Mesh>(null);
  const sweep = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (dish.current) dish.current.rotation.y = awake ? t * 0.9 : Math.sin(t * 0.3) * 0.3;
    if (globe.current) globe.current.rotation.y = t * 0.5;
    if (sweep.current) sweep.current.rotation.z = -t * (awake ? 2.2 : 0.4);
  });
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 1.2, 10]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <group ref={dish} position={[0, 1.4, 0]}>
        <mesh rotation={[0.9, 0, 0]}>
          <sphereGeometry args={[1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.35]} />
          <meshStandardMaterial color="#d4d4d8" side={THREE.DoubleSide} metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.5, 0.6]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={awake ? 2 : 0.3} />
        </mesh>
      </group>
      <mesh ref={globe} position={[2.2, 1.5, 0]}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={awake ? 0.8 : 0.2} wireframe />
      </mesh>
      <mesh ref={sweep} rotation={[-Math.PI / 2, 0, 0]} position={[2.2, 0.03, 0]}>
        <ringGeometry args={[0.1, 1.3, 24, 1, 0, 0.7]} />
        <meshBasicMaterial color={colour} transparent opacity={awake ? 0.5 : 0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Billboard({ colour, awake }: { colour: string; awake: boolean }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const bars = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (screen.current) screen.current.emissiveIntensity = awake ? 0.5 + (Math.sin(t * 1.5) + 1) * 0.3 : 0.1;
    if (bars.current) bars.current.children.forEach((c, i) => (c.scale.y = 0.4 + (Math.sin(t * (1.2 + i * 0.3) + i) + 1) * (awake ? 0.5 : 0.1)));
  });
  return (
    <group>
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, 1.2, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 2.4, 8]} />
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
      ))}
      <mesh position={[0, 2.7, 0]}>
        <boxGeometry args={[3.4, 1.9, 0.12]} />
        <meshStandardMaterial color="#111114" />
      </mesh>
      <mesh position={[0, 2.7, 0.07]}>
        <planeGeometry args={[3.2, 1.7]} />
        <meshStandardMaterial ref={screen} color="#1a0f05" emissive={colour} emissiveIntensity={0.3} />
      </mesh>
      <group ref={bars} position={[-1.1, 2.0, 0.09]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[i * 0.42, 0.4, 0]}>
            <boxGeometry args={[0.28, 0.8, 0.02]} />
            <meshBasicMaterial color="#fff7ed" transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      {[-1.2, 1.2].map((x) => (
        <spotLight key={x} position={[x, 3.9, 0.9]} target-position={[x, 2.7, 0]} angle={0.5} penumbra={0.6} intensity={awake ? 6 : 1} color="#fff7ed" distance={5} />
      ))}
    </group>
  );
}

function ServerRack({ colour, awake }: { colour: string; awake: boolean }) {
  const leds = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (leds.current)
      leds.current.children.forEach((c, i) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = awake ? (Math.sin(t * (3 + (i % 5)) + i * 1.7) > 0.2 ? 1 : 0.15) : 0.25;
      });
  });
  const rows = [0, 1, 2, 3, 4, 5, 6];
  return (
    <group>
      {[-0.9, 0.9].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.3, 0]}>
            <boxGeometry args={[1.3, 2.6, 0.9]} />
            <meshStandardMaterial color="#1c1c22" metalness={0.6} roughness={0.4} />
          </mesh>
          {rows.map((r) => (
            <mesh key={r} position={[0, 0.35 + r * 0.33, 0.46]}>
              <boxGeometry args={[1.15, 0.22, 0.02]} />
              <meshStandardMaterial color="#2a2a33" />
            </mesh>
          ))}
        </group>
      ))}
      <group ref={leds}>
        {[-0.9, 0.9].flatMap((x) => rows.map((r) => (
          <mesh key={`${x}-${r}`} position={[x - 0.42, 0.35 + r * 0.33, 0.48]}>
            <boxGeometry args={[0.1, 0.06, 0.02]} />
            <meshBasicMaterial color={colour} transparent opacity={1} />
          </mesh>
        )))}
      </group>
      <pointLight position={[0, 1.5, 1]} color={colour} intensity={awake ? 3 : 0.5} distance={5} />
    </group>
  );
}

function Vault({ colour, awake }: { colour: string; awake: boolean }) {
  const wheel = useRef<THREE.Mesh>(null);
  const coin = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (wheel.current) wheel.current.rotation.z = awake ? t * 1.5 : 0;
    if (coin.current) {
      coin.current.rotation.y = t * 2;
      coin.current.position.y = 2.9 + Math.sin(t * 2) * 0.15;
    }
  });
  return (
    <group>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[2.6, 2.4, 1.4]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.2, 0.72]}>
        <cylinderGeometry args={[0.95, 0.95, 0.1, 32]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.2, 0.75]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.1, 32]} />
        <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={wheel} position={[0, 1.2, 0.84]}>
        <torusGeometry args={[0.45, 0.06, 10, 24]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.2} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.2, 0.84]} rotation={[0, 0, (i * Math.PI) / 3]}>
          <boxGeometry args={[0.9, 0.06, 0.06]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      <mesh ref={coin} position={[0, 2.9, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 24]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={awake ? 0.6 : 0.15} metalness={0.9} roughness={0.25} />
      </mesh>
      <pointLight position={[0, 2.9, 1]} color={colour} intensity={awake ? 3 : 0.6} distance={5} />
    </group>
  );
}

function VideoWall({ colour, awake }: { colour: string; awake: boolean }) {
  const tiles = useRef<THREE.Group>(null);
  const crane = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (tiles.current)
      tiles.current.children.forEach((c, i) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = awake ? 0.25 + (Math.sin(t * (0.8 + (i % 4) * 0.35) + i * 2.1) + 1) * 0.45 : 0.08;
      });
    if (crane.current) crane.current.rotation.y = awake ? Math.sin(t * 0.5) * 0.5 : 0;
  });
  return (
    <group>
      <mesh position={[0, 1.9, 0]}>
        <boxGeometry args={[4.0, 2.4, 0.15]} />
        <meshStandardMaterial color="#111114" />
      </mesh>
      <group ref={tiles} position={[-1.3, 1.9, 0.09]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[(i % 3) * 1.3, i < 3 ? 0.55 : -0.55, 0]}>
            <planeGeometry args={[1.2, 1.0]} />
            <meshStandardMaterial color="#0b0b0f" emissive={colour} emissiveIntensity={0.3} />
          </mesh>
        ))}
      </group>
      <group ref={crane} position={[2.6, 0, 0.6]}>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 1.8, 8]} />
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
        <mesh position={[0, 1.8, 0.5]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.1, 0.1, 1.6]} />
          <meshStandardMaterial color="#52525b" />
        </mesh>
        <mesh position={[0, 1.55, 1.25]}>
          <boxGeometry args={[0.35, 0.28, 0.45]} />
          <meshStandardMaterial color="#18181b" />
        </mesh>
        <mesh position={[0, 1.55, 1.5]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={awake ? 2 : 0.2} />
        </mesh>
      </group>
    </group>
  );
}

function Plant({ x, z, big }: { x: number; z: number; big?: boolean }) {
  const s = big ? 1.4 : 1;
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.28, 0.22, 0.6, 10]} />
        <meshStandardMaterial color="#7c4a2d" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.26) * 0.18, 0.95 + (i % 2) * 0.2, Math.sin(i * 1.26) * 0.18]} rotation={[0.4, i * 1.26, 0.3]}>
          <coneGeometry args={[0.2, 0.9, 6]} />
          <meshStandardMaterial color={i % 2 ? "#15803d" : "#16a34a"} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Reception({ colour, awake }: { colour: string; awake: boolean }) {
  const steam = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (steam.current)
      steam.current.children.forEach((c, i) => {
        c.position.y = 1.0 + ((t * 0.4 + i * 0.33) % 1) * 0.8;
        ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = awake ? 0.5 - ((t * 0.4 + i * 0.33) % 1) * 0.5 : 0;
      });
  });
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 1.0, 32, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#2a1f3d" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 0.06, 32, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#f5d0fe" />
      </mesh>
      <mesh position={[0, 0.5, 0.05]}>
        <boxGeometry args={[2.2, 0.08, 0.02]} />
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={awake ? 1.2 : 0.2} />
      </mesh>
      <Plant x={-2.1} z={0.2} big />
      <Plant x={2.1} z={0.2} big />
      <mesh position={[0.6, 1.14, 0.4]}>
        <cylinderGeometry args={[0.12, 0.1, 0.18, 12]} />
        <meshStandardMaterial color="#fafafa" />
      </mesh>
      <group ref={steam} position={[0.6, 0, 0.4]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.05, 6, 6]} />
            <meshBasicMaterial color="#fff" transparent opacity={0.4} />
          </mesh>
        ))}
      </group>
      <Html position={[0, 2.1, 0]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div style={{ color: colour, fontWeight: 700, letterSpacing: 2, fontSize: 12, textShadow: "0 1px 4px #000" }}>WELCOME</div>
      </Html>
    </group>
  );
}

function PhoneBank({ colour, awake }: { colour: string; awake: boolean }) {
  const phone = useRef<THREE.Group>(null);
  const bell = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (phone.current) phone.current.rotation.z = awake ? Math.sin(t * 40) * 0.05 : 0;
    if (bell.current) bell.current.emissiveIntensity = awake ? (Math.sin(t * 8) > 0 ? 2 : 0.4) : 0.2;
  });
  return (
    <group>
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[3.2, 1.8, 0.1]} />
        <meshStandardMaterial color="#111114" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i}>
          <mesh position={[-1.3, 2.3 - i * 0.4, 0.06]}>
            <boxGeometry args={[0.45, 0.14, 0.01]} />
            <meshBasicMaterial color="#e5e7eb" />
          </mesh>
          <mesh position={[0.2 - (0.6 * i) / 2, 2.3 - i * 0.4, 0.06]}>
            <boxGeometry args={[2.2 - i * 0.6, 0.14, 0.01]} />
            <meshBasicMaterial color={colour} transparent opacity={0.8 - i * 0.15} />
          </mesh>
        </group>
      ))}
      <Html position={[0, 2.85, 0.1]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div style={{ color: colour, fontWeight: 700, letterSpacing: 2, fontSize: 12, textShadow: "0 1px 4px #000" }}>LEADERBOARD</div>
      </Html>
      <group ref={phone} position={[2.2, 0.9, 0.3]}>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[0.7, 0.3, 0.5]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0, 1.15, 0]} rotation={[0, 0, 0.1]}>
          <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
          <meshStandardMaterial color="#1c1c22" />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.09, 0.14, 0.9, 8]} />
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
        <mesh position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial ref={bell} color={colour} emissive={colour} emissiveIntensity={1} />
        </mesh>
      </group>
    </group>
  );
}

function Tower({ colour, awake }: { colour: string; awake: boolean }) {
  const lamp = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (lamp.current) lamp.current.rotation.y = s.clock.elapsedTime * (awake ? 3 : 0.5);
  });
  return (
    <group>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.35, 0.6, 2.8, 8]} />
        <meshStandardMaterial color="#27272a" metalness={0.5} roughness={0.5} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.0 + i * 0.6, 0.45]} rotation={[0, (i - 1) * 0.6, 0]}>
          <boxGeometry args={[0.7, 0.45, 0.05]} />
          <meshStandardMaterial color="#0b0b0f" emissive={colour} emissiveIntensity={awake ? 0.9 : 0.15} />
        </mesh>
      ))}
      <group ref={lamp} position={[0, 3.0, 0]}>
        <mesh>
          <sphereGeometry args={[0.18, 10, 10]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={awake ? 2.5 : 0.4} />
        </mesh>
        <spotLight position={[0, 0, 0]} target-position={[4, -2, 0]} angle={0.4} penumbra={0.5} color="#f59e0b" intensity={awake ? 8 : 1} distance={9} />
      </group>
    </group>
  );
}

function Kit({ sector, awake }: { sector: Sector; awake: boolean }) {
  const x = R_PROP * Math.cos(sector.mid);
  const z = -R_PROP * Math.sin(sector.mid);
  const yaw = Math.atan2(-x, -z);
  const props = { colour: sector.colour, awake };
  let body: ReactNode = null;
  switch (sector.id) {
    case "research": body = <Radar {...props} />; break;
    case "ads": body = <Billboard {...props} />; break;
    case "website": body = <ServerRack {...props} />; break;
    case "funds": body = <Vault {...props} />; break;
    case "marketing": body = <VideoWall {...props} />; break;
    case "care": body = <Reception {...props} />; break;
    case "sales": body = <PhoneBank {...props} />; break;
    default: body = <Tower {...props} />;
  }
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {body}
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

type Tally = { awake: number; asleep: number; error: number };

function Room({ sectors, tally }: { sectors: Sector[]; tally: Record<string, Tally> }) {
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
      {[4.2, 9.2, 13.2].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[r, r + 0.04, 96]} />
          <meshBasicMaterial color="#27272a" />
        </mesh>
      ))}
      {sectors.map((s) => {
        const t = tally[s.id] ?? { awake: 0, asleep: 0, error: 0 };
        const n = t.awake + t.asleep + t.error;
        const share = n ? t.awake / n : 0;
        const gapA = (s.end + GAP / 2);
        return (
          <group key={s.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[3.2, R_FLOOR - 0.4, 48, 1, s.start, s.end - s.start]} />
              <meshStandardMaterial color={s.colour} transparent opacity={0.07 + share * 0.16} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
              <ringGeometry args={[R_FLOOR - 0.5, R_FLOOR - 0.35, 48, 1, s.start, s.end - s.start]} />
              <meshBasicMaterial color={s.colour} />
            </mesh>
            {/* sector sign with the headcount, readable from anywhere */}
            <Html position={[(R_FLOOR + 2.2) * Math.cos(s.mid), 4.2, -(R_FLOOR + 2.2) * Math.sin(s.mid)]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
              <div style={{ textAlign: "center", whiteSpace: "nowrap", background: "rgba(9,9,11,0.8)", border: `1px solid ${s.colour}88`, borderRadius: 10, padding: "6px 12px", boxShadow: t.awake ? `0 0 18px ${s.colour}55` : "none" }}>
                <div style={{ fontSize: 15, letterSpacing: 3, fontWeight: 800, color: s.colour }}>{s.label}</div>
                <div style={{ fontSize: 12, marginTop: 2, color: "#e4e4e7" }}>
                  <span style={{ color: AWAKE, fontWeight: 700 }}>{t.awake} awake</span>
                  <span style={{ color: "#71717a" }}> · </span>
                  <span style={{ color: "#93c5fd" }}>{t.asleep} asleep</span>
                  {t.error ? <span style={{ color: "#fb7185", fontWeight: 700 }}> · {t.error} needs a look</span> : null}
                </div>
              </div>
            </Html>
            <Kit sector={s} awake={t.awake > 0} />
            <Plant x={(R_FLOOR - 1.2) * Math.cos(gapA)} z={-(R_FLOOR - 1.2) * Math.sin(gapA)} />
          </group>
        );
      })}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[R_FLOOR, R_FLOOR, 0.6, 96, 1, true]} />
        <meshStandardMaterial color="#1a1c24" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.62, 0]}>
        <ringGeometry args={[R_FLOOR - 0.06, R_FLOOR + 0.06, 96]} />
        <meshBasicMaterial color="#3f3f46" />
      </mesh>
      {/* a low glass wall so the room reads as a room from above */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[R_FLOOR + 0.02, R_FLOOR + 0.02, 2.0, 96, 1, true]} />
        <meshStandardMaterial color="#6ee7b7" side={THREE.DoubleSide} transparent opacity={0.05} depthWrite={false} />
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
  const tally = useMemo(() => {
    const out: Record<string, Tally> = {};
    for (const t of TEAMS) {
      const keys = [t.manager.key, ...t.members.map((m) => m.key)].filter(Boolean) as string[];
      const c: Tally = { awake: 0, asleep: 0, error: 0 };
      for (const k of keys) {
        const a = byKey[k];
        if (!a) continue;
        const st = status(a);
        if (st === "working") c.awake++;
        else if (st === "error") c.error++;
        else c.asleep++;
      }
      out[t.id] = c;
    }
    return out;
  }, [byKey]);
  const totals = Object.values(tally).reduce((a, t) => ({ awake: a.awake + t.awake, asleep: a.asleep + t.asleep, error: a.error + t.error }), { awake: 0, asleep: 0, error: 0 });
  const anyWorking = totals.awake > 0;
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
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 28, 32], fov: 42 }} gl={{ antialias: true }}>
          <color attach="background" args={["#08080b"]} />
          <fog attach="fog" args={["#08080b", 50, 95]} />
          <hemisphereLight args={["#cbd5e1", "#0b0b10", 0.8]} />
          <directionalLight position={[10, 22, 12]} intensity={1.0} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} />
          <Room sectors={sectors} tally={tally} />
          <Links events={events} spots={spots} />
          <Brain learnings={learnings} active={anyWorking} />
          {seats.map((s) => (
            <Person key={s.id} seat={s} agent={s.agentKey ? byKey[s.agentKey] : undefined} />
          ))}
          <OrbitControls
            enablePan={false}
            target={[0, 0.5, 0]}
            minDistance={9}
            maxDistance={56}
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
        <div className="pointer-events-none absolute left-3 top-3 flex gap-2 text-[11px]">
          <span className="rounded-md border border-emerald-500/40 bg-zinc-950/80 px-2 py-1 font-semibold text-emerald-300">{totals.awake} awake</span>
          <span className="rounded-md border border-sky-500/30 bg-zinc-950/80 px-2 py-1 text-sky-300">{totals.asleep} asleep</span>
          {totals.error ? <span className="rounded-md border border-rose-500/40 bg-zinc-950/80 px-2 py-1 font-semibold text-rose-300">{totals.error} needs a look</span> : null}
        </div>
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-500">Green beacon = working now · blue ember = asleep · red = needs a look · drag to look around, scroll to zoom</div>
      </div>
    </Boundary>
  );
}
