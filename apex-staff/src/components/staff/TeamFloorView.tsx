"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { TeamAgent, TeamEvent } from "@/lib/staff/admaker";
import { TeamFloor } from "@/components/staff/TeamFloor";

const TeamFloor3D = dynamic(() => import("@/components/staff/TeamFloor3D").then((m) => m.TeamFloor3D), {
  ssr: false,
  loading: () => <div className="flex h-[460px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-500 sm:h-[640px]">Loading the office…</div>,
});

/** Switches between the 3D office and the flat map. The flat map is also the fallback if 3D cannot start. */
export function TeamFloorView({ agents, events, learnings }: { agents: TeamAgent[]; events: TeamEvent[]; learnings: number }) {
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const flat = <TeamFloor agents={agents} events={events} learnings={learnings} />;
  return (
    <div>
      <div className="mb-2 flex justify-end gap-1 text-xs">
        {(["3d", "2d"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md border px-2.5 py-1 ${mode === m ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
          >
            {m === "3d" ? "3D office" : "Flat map"}
          </button>
        ))}
      </div>
      {mode === "3d" ? <TeamFloor3D agents={agents} events={events} learnings={learnings} fallback={flat} /> : flat}
    </div>
  );
}
