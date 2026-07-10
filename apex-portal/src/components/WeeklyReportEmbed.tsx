export function WeeklyReportEmbed({ lookerStudioUrl }: { lookerStudioUrl: string | null }) {
  if (!lookerStudioUrl) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-card">
        <p className="text-sm text-forest-600">
          Your dashboard is being set up, check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
      <iframe
        src={lookerStudioUrl}
        title="Weekly Report"
        className="aspect-[4/3] w-full sm:aspect-[16/9]"
        allowFullScreen
      />
    </div>
  );
}
