"use client";

import { Component, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TeamAgent, TeamEvent } from "@/lib/staff/admaker";
import { BRAIN, COLOUR, EDGES, PLANNED, POS, ZONES, liveEdges, status } from "@/components/staff/TeamFloor";

/**
 * The research team as a 3D office. People sit at desks: typing while their agent is really working,
 * head down asleep when it is not. Lines to the brain glow only for hand-offs that really happened.
 * Everything here is driven by the same rows as the 2D floor; nothing moves for show.
 */

const SKIN = ["#f1c9a5", "#d9a47e", "#b97d56", "#8d5a3b", "#f5d6bb", "#c68b63"];
const HAIR = ["#1f1a17", "#3b2a1d", "#6b4a2b", "#b88a4a", "#2b2b33", "#7a3e2c"];

/** 2D floor coordinates (0..1000 by 0..850) to 3D metres. */
function to3(p: { x: number; y: number }): [number, number] {
  return [(p.x - 500) / 52, (p.y - 620) / 52];
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Person({ agent }: { agent: TeamAgent }) {
  const p = POS[agent.key];
  const [x, z] = to3(p);
  const st = status(agent);
  const colour = COLOUR[agent.role];
  const h = hash(agent.key);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const manager = agent.role === "manager";
  const scale = manager ? 1.15 : 1;

  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const sleep = useRef(st === "working" ? 0 : 1);
  const phase = (h % 100) / 10;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime + phase;
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
    // arms reach forward to the keyboard; when sleeping they lie on the desk
    const reach = -1.05 - s * 0.35;
    if (armL.current) armL.current.rotation.x = reach;
    if (armR.current) armR.current.rotation.x = reach;
    const type = awake * (st === "error" ? 0.1 : 1);
    if (foreL.current) foreL.current.rotation.x = 0.15 + Math.sin(t * 9) * 0.35 * type;
    if (foreR.current) foreR.current.rotation.x = 0.15 + Math.sin(t * 9 + 2.1) * 0.35 * type;
    if (screen.current) {
      const flicker = st === "working" ? 0.85 + Math.sin(t * 6) * 0.1 : st === "error" ? 0.8 + Math.sin(t * 10) * 0.2 : 0.05;
      screen.current.emissiveIntensity = flicker;
    }
  });

  const screenColour = st === "error" ? "#f43f5e" : colour;
  const shirt = colour;
  const task = st === "working" ? (agent.current_task ? agent.current_task.slice(0, 28) : "Working") : st === "error" ? "Needs a look" : "Asleep";

  return (
    <group position={[x, 0, z]} scale={scale}>
      <Desk accent={colour} lit={st !== "idle"} screenColour={screenColour} screenRef={screen} />
      {/* chair */}
      <mesh position={[0, 0.45, -0.75]} castShadow>
        <boxGeometry args={[0.7, 0.1, 0.6]} />
        <meshStandardMaterial color="#2a2a32" />
      </mesh>
      <mesh position={[0, 0.95, -1.05]}>
        <boxGeometry args={[0.7, 0.9, 0.08]} />
        <meshStandardMaterial color="#2a2a32" />
      </mesh>
      <mesh position={[0, 0.22, -0.75]}>
        <cylinderGeometry args={[0.04, 0.04, 0.45, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>

      {/* person, seated behind the desk */}
      <group position={[0, 0.5, -0.72]}>
        <group ref={torso} position={[0, 0.2, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[0.62, 0.78, 0.34]} />
            <meshStandardMaterial color={shirt} roughness={0.7} />
          </mesh>
          {manager ? (
            <mesh position={[0, 0.45, 0.18]}>
              <boxGeometry args={[0.1, 0.5, 0.02]} />
              <meshStandardMaterial color="#064e3b" />
            </mesh>
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
            {/* eyes: open when awake, shut line when asleep */}
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
          {/* arms */}
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.4, 0.62, 0]}>
              <mesh position={[0, -0.22, 0]} castShadow>
                <boxGeometry args={[0.16, 0.44, 0.16]} />
                <meshStandardMaterial color={shirt} roughness={0.7} />
              </mesh>
              <group ref={side < 0 ? foreL : foreR} position={[0, -0.44, 0]}>
                <mesh position={[0, -0.2, 0]} castShadow>
                  <boxGeometry args={[0.13, 0.4, 0.13]} />
                  <meshStandardMaterial color={skin} roughness={0.8} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      </group>

      <Html position={[0, 2.3, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fafafa" }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: st === "working" ? colour : st === "error" ? "#fb7185" : "#a1a1aa" }}>{task}</div>
        </div>
      </Html>
    </group>
  );
}

function Zzz() {
  return (
    <Html position={[0.3, 0.45, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
      <div className="tf3-zzz" aria-hidden>
        <span>z</span>
        <span>z</span>
        <span>Z</span>
      </div>
    </Html>
  );
}

function Desk({
  accent,
  lit,
  screenColour,
  screenRef,
}: {
  accent: string;
  lit: boolean;
  screenColour: string;
  screenRef?: React.Ref<THREE.MeshStandardMaterial>;
}) {
  return (
    <group>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.08, 0.95]} />
        <meshStandardMaterial color="#3a3a44" roughness={0.6} />
      </mesh>
      {[-0.85, 0.85].map((lx) => (
        <mesh key={lx} position={[lx, 0.36, 0]}>
          <boxGeometry args={[0.08, 0.72, 0.85]} />
          <meshStandardMaterial color="#26262d" />
        </mesh>
      ))}
      <mesh position={[0, 0.725, 0.46]}>
        <boxGeometry args={[1.9, 0.02, 0.03]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 0.9 : 0.15} />
      </mesh>
      {/* monitor, seen from behind */}
      <mesh position={[0, 1.05, 0.2]} castShadow>
        <boxGeometry args={[0.9, 0.55, 0.05]} />
        <meshStandardMaterial color="#17171c" />
      </mesh>
      <mesh position={[0, 1.05, 0.23]}>
        <planeGeometry args={[0.84, 0.49]} />
        <meshStandardMaterial ref={screenRef} color="#0b0b0f" emissive={screenColour} emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[0, 0.8, 0.2]}>
        <cylinderGeometry args={[0.05, 0.08, 0.15, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* keyboard */}
      <mesh position={[0, 0.78, -0.12]}>
        <boxGeometry args={[0.6, 0.03, 0.2]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

function OpenDesk({ d }: { d: (typeof PLANNED)[number] }) {
  const [x, z] = to3(d);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.9, 0.08, 0.95]} />
        <meshStandardMaterial color="#2a2a31" transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, 0.45, -0.75]}>
        <boxGeometry args={[0.7, 0.1, 0.6]} />
        <meshStandardMaterial color="#2a2a32" transparent opacity={0.6} />
      </mesh>
      <Html position={[0, 1.6, 0]} center distanceFactor={11} style={{ pointerEvents: "none" }}>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#d4d4d8" }}>{d.name}</div>
          
        </div>
      </Html>
    </group>
  );
}

function Brain({ learnings, active }: { learnings: number; active: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [x, z] = to3(BRAIN);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.4;
      core.current.rotation.x = t * 0.25;
      core.current.scale.setScalar(1 + Math.sin(t * (active ? 3 : 1.2)) * 0.05);
    }
    if (ring.current) ring.current.rotation.z = t * 0.5;
  });
  return (
    <group position={[x, 1.9, z]}>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color="#064e3b" emissive="#34d399" emissiveIntensity={active ? 1.1 : 0.55} wireframe />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshStandardMaterial color="#10b981" emissive="#34d399" emissiveIntensity={0.9} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.05, 0.015, 8, 64]} />
        <meshBasicMaterial color="#6ee7b7" />
      </mesh>
      <pointLight color="#34d399" intensity={active ? 6 : 3} distance={9} />
      <mesh position={[0, -1.25, 0]}>
        <cylinderGeometry args={[0.35, 0.5, 0.5, 20]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <Html position={[0, 1.55, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#6ee7b7" }}>Brand brain</div>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>{learnings} learnings</div>
        </div>
      </Html>
    </group>
  );
}

function Links({ events, byKey }: { events: TeamEvent[]; byKey: Record<string, TeamAgent> }) {
  const live = useMemo(() => liveEdges(events), [events]);
  const point = (k: string): [number, number, number] => {
    if (k === "brain") {
      const [x, z] = to3(BRAIN);
      return [x, 1.9, z];
    }
    const [x, z] = to3(POS[k]);
    return [x, 1.6, z];
  };
  return (
    <>
      {EDGES.filter((e) => POS[e.from] && (e.to === "brain" || POS[e.to])).map((e) => {
        const on = live.has(`${e.from}>${e.to}`);
        const a = point(e.from);
        const b = point(e.to);
        const mid: [number, number, number] = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 1.2, (a[2] + b[2]) / 2];
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b));
        const colour = on ? COLOUR[byKey[e.from]?.role ?? "worker"] : "#3f3f46";
        return <Line key={`${e.from}-${e.to}`} points={curve.getPoints(24)} color={colour} lineWidth={on ? 2.4 : 0.8} transparent opacity={on ? 0.95 : 0.35} />;
      })}
    </>
  );
}

function Room() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[24, 28]} />
        <meshStandardMaterial color="#0e0f13" roughness={0.9} />
      </mesh>
      <gridHelper args={[28, 28, "#1f2937", "#17191f"]} position={[0, 0, 0]} />
      {ZONES.map((zone) => {
        const [cx, cz] = to3({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 });
        return (
          <group key={zone.label} position={[cx, 0.01, cz]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[zone.w / 52, zone.h / 52]} />
              <meshStandardMaterial color="#10231d" transparent opacity={0.35} />
            </mesh>
            <Html position={[-(zone.w / 104) + 0.3, 0.05, -(zone.h / 104) + 0.1]} style={{ pointerEvents: "none" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#6ee7b7", opacity: 0.85, whiteSpace: "nowrap" }}>{zone.label}</div>
            </Html>
          </group>
        );
      })}
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
  const byKey = useMemo(() => Object.fromEntries(agents.map((a) => [a.key, a])), [agents]);
  const anyWorking = agents.some((a) => status(a) === "working");
  return (
    <Boundary fallback={fallback}>
      <div className="relative h-[520px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 sm:h-[760px]">
        <style>{`
          .tf3-zzz { display:flex; gap:4px; font-weight:700; color:#93c5fd; font-size:18px; }
          .tf3-zzz span { animation: tf3-float 2.4s ease-in-out infinite; opacity:0; }
          .tf3-zzz span:nth-child(2) { animation-delay: .6s; font-size:22px; }
          .tf3-zzz span:nth-child(3) { animation-delay: 1.2s; font-size:28px; }
          @keyframes tf3-float { 0% { transform: translateY(8px); opacity:0 } 30% { opacity:.9 } 100% { transform: translateY(-22px); opacity:0 } }
        `}</style>
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 22, 15], fov: 44 }} gl={{ antialias: true }}>
          <color attach="background" args={["#09090b"]} />
          <fog attach="fog" args={["#09090b", 40, 70]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[8, 16, 10]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
          <Room />
          <Links events={events} byKey={byKey} />
          <Brain learnings={learnings} active={anyWorking} />
          {agents.filter((a) => POS[a.key]).map((a) => (
            <Person key={a.key} agent={a} />
          ))}
          {PLANNED.map((d) => (
            <OpenDesk key={d.name} d={d} />
          ))}
          <OrbitControls
            enablePan={false}
            target={[0, 0, 0.5]}
            minDistance={7}
            maxDistance={40}
            minPolarAngle={0.3}
            maxPolarAngle={1.3}
            minAzimuthAngle={-0.9}
            maxAzimuthAngle={0.9}
          />
        </Canvas>
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-500">Drag to look around · scroll to zoom</div>
      </div>
    </Boundary>
  );
}
