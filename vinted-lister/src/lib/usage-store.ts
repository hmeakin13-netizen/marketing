import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { linkAccount, normaliseUsage, unlinkAccount, type Usage } from "./plans";

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

const fresh = (): Usage => ({ plan: "trial", used: 0, periodStart: new Date().toISOString(), accounts: [], extraAccounts: 0 });

export async function getUsage(userId: string): Promise<Usage> {
  const db = await read();
  return normaliseUsage({ ...fresh(), ...db[userId] });
}

async function mutate<T>(userId: string, fn: (u: Usage) => { usage: Usage; result: T }): Promise<T> {
  const db = await read();
  const { usage, result } = fn(normaliseUsage({ ...fresh(), ...db[userId] }));
  db[userId] = usage;
  await write(db);
  return result;
}

/**
 * Only call after a listing was actually generated, so failures don't burn quota or claim a slot.
 * Claims the Vinted account's slot (if not already linked) and counts the listing in one write.
 */
export async function recordListing(userId: string, vintedAccount: string): Promise<Usage> {
  return mutate(userId, (u) => {
    const link = linkAccount(u, vintedAccount);
    const base = link.ok ? link.usage : u; // generate route already verified the link is allowed
    const next = { ...base, used: base.used + 1 };
    return { usage: next, result: next };
  });
}

export async function linkVintedAccount(userId: string, vintedAccount: string) {
  return mutate(userId, (u) => {
    const r = linkAccount(u, vintedAccount);
    return { usage: r.ok ? r.usage : u, result: r };
  });
}

export async function unlinkVintedAccount(userId: string, vintedAccount: string) {
  return mutate(userId, (u) => {
    const r = unlinkAccount(u, vintedAccount);
    return { usage: r.ok ? r.usage : u, result: r };
  });
}
