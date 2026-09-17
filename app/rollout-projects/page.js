import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Rollout and multi-site projects across British Columbia",
  description:
    "The same task at twenty sites, on a schedule. Display installs, bollard cutting, wheel stop removal and graffiti removal for national and provincial programs.",
};

export default function Page() {
  return (
    <ServicePage
      title="Rollout and multi-site work"
      lede="Some jobs aren't one site — they're the same task at twenty, on a schedule, done the same way each time."
      photos={[
        { src: "/images/rollout-1.jpg", alt: "Bollard work at a multi-site rollout project" },
      ]}
    >
      <p>We take on rollout work throughout the province. Recent projects:</p>
      <ul>
        <li>Display stand assemblies for new televisions across multiple retail locations</li>
        <li>Cutting down bollards and removing wheel stops at Tesla Supercharger stations</li>
        <li>Graffiti removal across multiple bank branches</li>
      </ul>

      <h2>What you get</h2>
      <p>
        Our own crew and equipment, WorkSafeBC coverage, a $5 million liability policy,
        and photo documentation of every site as it&apos;s completed. One invoice and one
        point of contact, rather than chasing a different trade in each town.
      </p>
      <p>
        If you&apos;re managing a national or provincial program and need a reliable
        contractor for the BC coast, get in touch.
      </p>
    </ServicePage>
  );
}
