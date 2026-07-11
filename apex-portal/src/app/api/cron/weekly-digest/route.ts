import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchClientUpdates, normalizeNotionPageId } from "@/lib/notion";
import { summarizeForDigest } from "@/lib/summary";
import type { ClientRow } from "@/lib/types";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function digestEmailHtml(businessName: string, summary: string, dashboardUrl: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #152a1f;">
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #3f7152; margin: 0 0 8px;">Apex Leads</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">This week for ${businessName}</h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${summary}</p>
      <a href="${dashboardUrl}" style="display: inline-block; background: #234634; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-size: 14px; font-weight: 600;">View your dashboard</a>
      <p style="font-size: 12px; color: #87714e; margin-top: 32px;">Built for landscapers, by people who get the trade.</p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Digest is not fully configured" }, { status: 501 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createAdminClient();
  const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`
    : "https://portal.apex-leads.co.uk/dashboard";
  const fromEmail = process.env.DIGEST_FROM_EMAIL ?? "updates@portal.apex-leads.co.uk";

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, business_name, email, notion_page_id, looker_studio_url, created_at, last_seen_at")
    .not("notion_page_id", "is", null)
    .returns<ClientRow[]>();

  if (error) {
    console.error("Weekly digest: failed to load clients", error);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }

  const results = { sent: 0, skipped: 0, failed: 0 };
  const weekAgo = Date.now() - ONE_WEEK_MS;

  for (const client of clients ?? []) {
    const pageId = client.notion_page_id ? normalizeNotionPageId(client.notion_page_id) : null;
    if (!pageId) {
      results.skipped++;
      continue;
    }

    try {
      const { entries } = await fetchClientUpdates(pageId);
      const recent = entries.filter((e) => new Date(e.lastEditedTime).getTime() >= weekAgo);
      if (recent.length === 0) {
        results.skipped++;
        continue;
      }

      const summary = await summarizeForDigest(client.business_name, recent);
      if (!summary) {
        results.skipped++;
        continue;
      }

      await resend.emails.send({
        from: `Apex Leads <${fromEmail}>`,
        to: client.email,
        subject: `Your weekly update — ${client.business_name}`,
        html: digestEmailHtml(client.business_name, summary, dashboardUrl),
      });
      results.sent++;
    } catch (err) {
      console.error(`Weekly digest failed for ${client.email}`, err);
      results.failed++;
    }
  }

  return NextResponse.json({ status: "done", ...results });
}
