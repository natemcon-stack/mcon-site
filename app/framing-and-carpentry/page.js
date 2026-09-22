import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Framing and carpentry — Powell River and the qathet region",
  description:
    "New builds, additions, structural alterations and finish carpentry by a red seal carpenter. Quality at every stage, nothing left for the next trade to clean up.",
};

export default function Page() {
  return (
    <ServicePage
      title="Framing and carpentry"
      lede="Planning a new build, an addition, or structural alterations to your home — plus all the finish work to close things up after? We can help."
      photos={[
        {
          src: "/images/framing-1.jpg",
          alt: "An excavator holding a framed barn wall while it's braced",
          caption:
            "A barn in the Cariboo, framed in rough-cut fir the owner supplied from Toosey Old School, a mill west of Williams Lake. He helped us stand this wall himself. He wanted a barn that would last generations — that's what we framed.",
        },
        {
          src: "/images/framing-2.jpg",
          alt: "A curved staircase with new flooring and repainted spindles during an insurance rebuild",
          caption:
            "An insurance rebuild at a home on the ocean in Northside. We worked around the existing curved staircase — tucking a kitchenette beneath it, having new flooring installed on the floor and stairs, cleaning and repainting the spindles, and reframing the ceiling dead level before drywall and paint. The client chose the carpet; we pointed out that the blue pattern would never line up across the treads, and that a white riser would give enough relief that it wouldn't nag at them later.",
        },
        {
          src: "/images/framing-3.jpg",
          alt: "Exposed rafters and timber posts on a greenhouse under construction",
          caption:
            "The Chimney Lake greenhouse from the other corner. Exposed rafters run the full depth of the shed roof, with the window openings sized to fit glass the client already owned.",
        },
      ]}
    >
      <p>
        Our founder is a red seal carpenter who learned on the job from experienced
        carpenters and tradesmen who generously shared decades of wisdom.
      </p>
      <p>
        Unlike many tradespeople, we take projects from start to finish. That means
        we&apos;ve seen the consequences of missed steps at the framing stage that cause
        problems later at finishing. We know the importance of quality at every stage, and
        we don&apos;t leave anything for another tradesperson to clean up after us.
      </p>

      <h2>Training the next crew</h2>
      <p>
        We offer hands-on training, guidance and growth opportunities to our employees,
        whether or not they&apos;re registered as formal apprentices.
      </p>
      <p>
        It may seem counterintuitive — it means lower margins for us on those projects —
        but even on a firm price with a known scope, we won&apos;t pressure our crew to
        move faster than is safe, or faster at the risk of a lower quality product. Firm
        price jobs are the perfect opportunity to train our crew on best work practices,
        where it doesn&apos;t cost the client any extra billable hours. It&apos;s how we
        invest in ourselves and bring more value to every client after.
      </p>
    </ServicePage>
  );
}
