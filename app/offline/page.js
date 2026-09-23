// Shown when a page is opened with no signal and nothing cached for it.
//
// Deliberately plain and specific about what still works, rather than a generic error.
// Someone on a job site needs to know whether to carry on or drive somewhere with bars.
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-xl font-semibold tracking-wide mb-2">No signal</h1>
        <p className="text-sm text-ink/60 mb-4">
          This page hasn&apos;t been opened on this phone before, so there&apos;s nothing
          saved to show you.
        </p>
        <p className="text-sm text-ink/60 mb-5">
          Clocking in and out, job details you&apos;ve already opened, and building a quote
          all still work. Everything saves on your phone and sends when you&apos;re back in
          range.
        </p>
        <a href="/today"
          className="inline-block bg-accent text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
          Back to this week
        </a>
      </div>
    </div>
  );
}
