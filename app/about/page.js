export const metadata = {
  title: "About",
  description:
    "M-CON Enterprises Inc. started in 2015 as Muth Construction. Run by Nate Muth, a red seal carpenter, serving Powell River and the qathet region.",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-display text-4xl font-700 sm:text-5xl">
        About M-CON Enterprises Inc.
      </h1>

      <div className="mt-8 max-w-prose space-y-5 text-lg leading-relaxed">
        <p>
          We started in the Lower Mainland in 2015 as Muth Construction. In 2019 we moved
          to the Cariboo, where the business really got into full swing, and we&apos;ve
          since brought it to the Upper Sunshine Coast. When we incorporated in 2024 we
          wanted a name that was easier to say — M-CON is what was left.
        </p>
        <p>
          Some of the projects we&apos;re proudest of are from the Cariboo, so you&apos;ll
          see them in our work alongside jobs closer to home.
        </p>
        <p>
          M-CON Enterprises Inc. is run by our founder Nate Muth, a red seal carpenter by
          trade who learned on the job from experienced carpenters and tradesmen who
          generously shared decades of wisdom.
        </p>
        <p>
          We&apos;re proud to pass that on. We offer hands-on training, guidance and
          growth opportunities to our employees, whether or not they&apos;re registered as
          formal apprentices.
        </p>
        <p>
          We primarily serve the Upper Sunshine Coast: Powell River, the qathet region and
          the surrounding islands. We also take on remote work and rollout-style projects
          throughout British Columbia.
        </p>
      </div>

      <dl className="mt-12 max-w-sm">
        <div className="rule-item flex items-baseline justify-between gap-6 py-3">
          <dt>Liability insurance</dt>
          <dd className="figures font-display font-600">$5 million</dd>
        </div>
        <div className="rule-item flex items-baseline justify-between gap-6 py-3">
          <dt>WorkSafeBC</dt>
          <dd className="font-display font-600">Up to date</dd>
        </div>
        <div className="rule-item flex items-baseline justify-between gap-6 py-3">
          <dt>Established</dt>
          <dd className="figures font-display font-600">2015</dd>
        </div>
      </dl>
    </div>
  );
}
