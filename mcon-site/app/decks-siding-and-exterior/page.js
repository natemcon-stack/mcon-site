import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Decks, siding, windows, doors and garage doors",
  description:
    "New decks, complete siding replacement, windows and doors, and garage door service and installation across Powell River and the qathet region.",
};

export default function Page() {
  return (
    <ServicePage
      title="Decks, siding and exterior"
      lede="New decks, complete siding replacement, windows and doors, and garage door service, supply and installation."
      photos={[
        { src: "/images/deck-1.jpg", alt: "A cedar deck built by M-CON Enterprises" },
        { src: "/images/siding-1.jpg", alt: "Siding replacement by M-CON Enterprises" },
      ]}
    >
      <p>
        We work quality and safety first. We don&apos;t rush a job to get to the next
        one, and we don&apos;t cut the steps that stop showing once the siding is on.
      </p>
      <p>
        We supply our own materials, so the right products go into your build and
        there&apos;s no waiting on procurement.
      </p>

      <h2>Garage doors</h2>
      <p>
        We service, supply and install garage doors — whether that&apos;s a repair to
        what you have or a full replacement.
      </p>

      <h2>Gutters</h2>
      <p>
        We install European-style gutters. If you&apos;re after seamless aluminum,
        we&apos;d point you to Modern Windows or Gutter Shark — both local, both do good
        work.
      </p>
    </ServicePage>
  );
}
