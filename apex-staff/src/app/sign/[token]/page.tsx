import { createAdminClient } from "@/lib/supabase/admin";
import { signContract } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign your agreement | Apex-Leads", robots: { index: false, follow: false } };

/** Public signing page. Only someone holding the private link can see the contract. */
export default async function SignPage({ params, searchParams }: { params: { token: string }; searchParams: { error?: string } }) {
  const { data: c } =
    params.token.length >= 20
      ? await createAdminClient().from("contracts").select("client_name, body, status, signed_at, signer_name").eq("sign_token", params.token).maybeSingle()
      : { data: null };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-400">Apex-Leads</p>
        {!c || c.status === "ended" ? (
          <p className="text-sm text-zinc-400">This signing link is not valid. Ask Apex-Leads to send you a new one.</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-white">Your agreement</h1>
            <pre className="mt-6 whitespace-pre-wrap rounded-2xl border border-white/10 bg-zinc-900/60 p-5 font-sans text-sm leading-6 text-zinc-200">{c.body}</pre>
            {c.status === "signed" ? (
              <p className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Signed by {c.signer_name ?? c.client_name} on{" "}
                {new Date(c.signed_at!).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" })}. Thank you. You can close this page.
              </p>
            ) : (
              <form action={signContract} className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                <input type="hidden" name="token" value={params.token} />
                {searchParams.error ? <p className="text-sm text-rose-300">{searchParams.error}</p> : null}
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-400">Your full name</span>
                  <input name="signer_name" required minLength={3} autoComplete="name" className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none" />
                </label>
                <label className="flex items-start gap-2 text-sm text-zinc-300">
                  <input type="checkbox" name="agree" required className="mt-1 accent-emerald-500" />
                  <span>I have read this agreement and I agree to it. Typing my name here is my signature.</span>
                </label>
                <button className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400">Sign agreement</button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
