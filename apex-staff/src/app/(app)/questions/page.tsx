import { requireRole } from "@/lib/staff/auth";
import { HarryQuestions } from "@/components/staff/HarryQuestions";
import { Notice, PageHeader } from "@/components/staff/ui";

export const metadata = { title: "Questions | Apex Team" };
export const dynamic = "force-dynamic";

export default async function QuestionsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin");
  return (
    <>
      <PageHeader title="Questions" subtitle="Decisions the team needs from you. Tap Yes or No and they read it on their next run." />
      <Notice ok={searchParams.ok} error={searchParams.error} />
      <HarryQuestions supabase={supabase} />
    </>
  );
}
