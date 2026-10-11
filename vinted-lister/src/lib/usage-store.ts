import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { normaliseUsage, type Usage } from "./plans";

/**
 * Prototype store: one JSON file on disk, keyed by anonymous user id.
 * Replace with Supabase (see supabase/migrations) before launch; the interface is
 * deliberately tiny so the swap is mechanical.
 */
const FILE = path.join(process.cwd(), ".data", "usage.json");

type Db = Record<string, Usage>;

async function read(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Db;
  } catch {
    return {};
  }
}

async function write(db: Db) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}

export async function getUsage(userId: string): Promise<Usage> {
  const db = await read();
  return normaliseUsage(db[userId] ?? { plan: "trial", used: 0, periodStart: new Date().toISOString() });
}

/** Only call after a listing was actually generated, so failures don't burn quota. */
export async function recordListing(userId: string): Promise<Usage> {
  const db = await read();
  const current = normaliseUsage(db[userId] ?? { plan: "trial", used: 0, periodStart: new Date().toISOString() });
  const next = { ...current, used: current.used + 1 };
  db[userId] = next;
  await write(db);
  return next;
}
