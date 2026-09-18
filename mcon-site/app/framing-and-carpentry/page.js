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
        { src: "/images/framing-1.jpg", alt: "Framing work in progress by M-CON Enterprises" },
        { src: "/images/framing-2.jpg", alt: "Finish carpentry by M-CON Enterprises" },
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
