import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "New builds — carports, garages and auxiliary structures",
  description:
    "Carports, garages, barns and shops in Powell River. New homes only for certified owner builders — and what to check before hiring any GC for a new home build.",
};

export default function Page() {
  return (
    <ServicePage
      title="Carports, garages and auxiliary structures"
      lede="We build carports, garages, barns, shops and other auxiliary structures."
      photos={[
        {
          src: "/images/new-build-1.jpg",
          alt: "A large shop framed and sheathed in winter at Lac La Hache",
          caption:
            "A large shop at Lac La Hache, framed under snow. Twelve-foot walls, room trusses, and a deep lean-to off the far side for equipment and trailer parking, spanned with TJI joists as rafters. We came in as the framing contractor on this one; the general contractor had the foundation poured well before the snow flew. We don't enjoy working at minus twenty, but if that's what the job needs, it gets done.",
        },
        {
          src: "/images/new-build-2.jpg",
          alt: "A gambrel-roofed garden shed with a green metal roof and an open lean-to",
          caption:
            "A labour of love, this one. It's in Maple Ridge, on the property our founder grew up on — his mother had been mentioning the need for a new garden shed for years. While they were away we demolished the old rotting one and built her the shed she'd been describing: ten-foot walls, and a footprint sized to stay inside local permitting requirements. The gambrel roof was a first for us and a good challenge. The lean-to was an afterthought, and turned out to be the perfect spot for Grandpa's tractor.",
        },
      ]}
    >
      <h2>New homes</h2>
      <p>
        We only take on new home builds where you hold your Owner Builder Certification —
        and in that case we&apos;re only permitted to take on a few of the main aspects of
        the contract, because as the owner builder, you are the General Contractor.
      </p>
      <p>
        If you don&apos;t have your OBC, use a general contractor licensed through BC
        Housing who carries New Home Warranty coverage — the 2-5-10.
      </p>

      <h2>Why we don&apos;t offer it</h2>
      <p>
        Entering the new home market is cost prohibitive for us. It requires a number of
        expensive courses and, more importantly, continuing education courses every year
        to maintain the licence. There are also plenty of GCs in Powell River who already
        offer this service well. It isn&apos;t one we wish to compete in.
      </p>

      <h2>One thing worth knowing before you hire anyone</h2>
      <p>
        Check the registry online for whichever GC you choose for your new home build.
        Many GCs offer this service using someone else&apos;s new home warranty
        information. That is not a situation you want to be involved in if your project
        runs into problems.
      </p>
    </ServicePage>
  );
}
