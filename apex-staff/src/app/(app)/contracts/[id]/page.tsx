import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";
import { fmtDate, fmtDateTime, todayIso } from "@/lib/staff/dates";
import { statusTone, type ContractRow } from "@/lib/staff/contracts";
import { CopyButton } from "@/components/staff/CopyButton";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, btnGhost, inputCls } from "@/components/staff/ui";
import { deleteDraft, markSent, uploadSigned } from "../actions";

export const metadata = { title: "Contract | Apex Team" };

export default async function ContractPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; error?: string } }) {
  // Row-level security decides what comes back: Harry gets any contract, a closer only their own clients'.
  const { supabase } = await requireRole("admin", "closer");
  const { data } = await supabase.from("contracts").select("*").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const c = data as ContractRow;
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const signUrl = `${origin}/sign/${c.sign_token}`;
  const open = c.status === "draft" || c.status === "sent";

  return (
    <>
      <PageHeader
        title={c.client_name}
        subtitle={`Created ${fmtDate(c.created_at)}${c.sent_at ? ` · sent ${fmtDate(c.sent_at)}` : ""}${c.signed_at ? ` · signed ${fmtDateTime(c.signed_at)}${c.signer_name ? ` by ${c.signer_name}` : ""}` : ""}`}
        action={
          <Link href="/contracts" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
            ← All contracts
          </Link>
        }
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Status</SectionTitle>
          <Badge tone={statusTone(c.status)}>{c.status}</Badge>
        </div>
        {open && c.sign_token ? (
          <>
            <p className="text-sm text-zinc-300">Send the client this private signing link yourself (text, WhatsApp or email). They read the contract, type their name and tick to agree; the signed PDF is then stored here.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">{signUrl}</code>
              <CopyButton text={signUrl} className={btnGhost} />
              {c.status === "draft" ? (
                <form action={markSent}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className={btnGhost}>I&apos;ve sent it</button>
                </form>
              ) : null}
            </div>
          </>
        ) : null}
        {c.file_path ? (
          <a href={`/api/contracts/${c.id}/file`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300">
            Open the signed PDF →
          </a>
        ) : null}
        {open ? (
          <details className="mt-4 border-t border-white/10 pt-3">
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-white">Signed another way? Upload the signed PDF</summary>
            <form action={uploadSigned} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Signed PDF">
                <input name="file" type="file" accept="application/pdf" required className={inputCls} />
              </Field>
              <Field label="Signed by">
                <input name="signer_name" className={inputCls} defaultValue={c.details?.contact_name ?? ""} />
              </Field>
              <Field label="Signed on">
                <input name="signed_on" type="date" defaultValue={todayIso()} className={inputCls} />
              </Field>
              <SubmitButton pendingText="Uploading…">Store signed copy</SubmitButton>
            </form>
          </details>
        ) : null}
        {c.status === "draft" ? (
          <form action={deleteDraft} className="mt-4 border-t border-white/10 pt-3">
            <input type="hidden" name="id" value={c.id} />
            <button className="text-xs text-rose-300 hover:text-rose-200">Delete this draft</button>
          </form>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Wording</SectionTitle>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-200">{c.body}</pre>
      </Card>
    </>
  );
}
