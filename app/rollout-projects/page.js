import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Rollout and multi-site projects across British Columbia",
  description:
    "25 sites across 23 BC cities in 14 days. Bollard and wheel stop removal, display installs and multi-site programs for national and provincial clients.",
};

export default function Page() {
  return (
    <ServicePage
      title="Rollout and multi-site work"
      lede="Some jobs aren't one site — they're the same task at twenty, on a schedule, done the same way each time."
      photos={[
        {
          src: "/images/rollout-1.jpg",
          alt: "Tesla Supercharger stalls taped off during province-wide bollard removal",
          caption:
            "Bollard and wheel stop removal at Tesla Supercharger stations across British Columbia.",
        },
        {
          src: "/images/rollout-2.jpg",
          alt: "A completed LG television display wall with integrated lighting",
          caption:
            "One of the completed display installs from the Cariboo rollout. Assembled and installed to the corporate specification, in multiple cities across the region.",
        },
      ]}
    >
      <h2>25 sites, 23 cities, 14 days</h2>
      <p>
        We were contacted in late autumn to remove bollards and wheel stops at Tesla
        Supercharger stations across British Columbia. Some stations had already been
        awarded to other contractors; we did most of them.
      </p>
      <p>
        Twenty-five sites in twenty-three cities. 258 bollards and wheel stops &mdash;
        most set in poured concrete, the rest bolted down.
      </p>
      <p>
        Cache Creek, Chilliwack, Delta, Hope, Kamloops, Langley, Maple Ridge, Merritt,
        Nanaimo, Osoyoos, Penticton, Port Alberni, Prince George, Princeton, Quesnel,
        Revelstoke, Salmon Arm, Sechelt, Squamish, Surrey, Vernon, West Kelowna and
        Williams Lake.
      </p>
      <p>
        The work meant cutting through quarter-inch steel wall pipe, breaking off the
        concrete, hauling the bollards to recycling stations and landfills along the
        route, and patching the concrete behind us. All of it in rain and snow, all of it
        before the end of December.
      </p>
      <p>
        We sent a small team. They finished ahead of schedule, safely, and to the
        client&apos;s satisfaction.
      </p>

      <p>Other rollout work we&apos;ve taken on:</p>
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
