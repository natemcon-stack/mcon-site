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
        {
          src: "/images/deck-1.jpg",
          alt: "A freestanding pressure-treated deck with mitred wrap-around steps at a mobile home",
          caption:
            "Replacing a rotted and previously patched deck in Powell River. Because it serves a mobile home, it can't be structurally attached to the building under the BC Building Code, so it's framed freestanding. The client saw it built as a rectangle, realized a wrap-around with mitred corners would look better, and we went back and did it. A handrail was added after this photo was taken.",
        },
        {
          src: "/images/deck-2.jpg",
          alt: "A deck refinished in a solid seafoam stain, overlooking the strait from Westview",
          caption:
            "Existing decks in Westview given a fresh look. We stained them in Sharkskin solid stain from Cloverdale Paints, in Seascape, cutting in between every board rather than rolling over the gaps — slower, but it's the difference between a finish that lasts and one that peels at the joints. These clients have a way with colour well outside anything we'd have picked, and it always turns out well.",
        },
        {
          src: "/images/deck-3.jpg",
          alt: "A post and beam deck cover with black-stained timbers at Tla'amin Nation",
          caption:
            "A post and beam deck cover at Tla'amin Nation. Frost-protected heavy-pour concrete footings to stand up to the ocean winds, metal roofing above, and every piece of lumber pre-painted before it went up so the finish is flawless with no raw edges hiding in the joints.",
        },
        {
          src: "/images/siding-1.jpg",
          alt: "The back of a Williams Lake home re-sided in Hardie board over new building wrap",
          caption:
            "The back of the Williams Lake home we did the full exterior upgrade on. Old vinyl siding stripped, new building wrap, and re-sided in Hardie board.",
        },
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

      <h2>How we build a deck</h2>
      <p>
        6x6 posts. Four-ply laminated 2x10 beams. 2x10 joists. Fasteners rated for use in
        pressure-treated lumber.
      </p>
      <p>
        Some would call that overbuilding. We follow the span tables published by the
        Canadian Wood Council, and where those tables call for larger lumber than we can
        source, we work with an engineer to specify the right engineered lumber rather
        than making do.
      </p>
      <p>
        We build in pressure-treated rather than cedar unless you ask otherwise &mdash;
        it&apos;s typically far more cost friendly for the same structure.
      </p>
      <p>
        Two things worth knowing. A deck attached to a mobile home isn&apos;t permitted
        under the BC Building Code, so those are built freestanding. And a deck less than
        two feet off the ground doesn&apos;t require a railing, though a handrail is often
        worth adding anyway for stability.
      </p>

      <h2>Why didn&apos;t you spray it?</h2>
      <p>
        The neighbours asked us that on a stucco repaint. Two reasons.
      </p>
      <p>
        Stucco has a lot of texture, and spray is directional. If you don&apos;t hit it
        from several angles you get uneven coverage &mdash; and over a light colour
        underneath, every spot you missed will jump out at you. We&apos;d rather know we
        have full coverage, even on the parts you&apos;d need a ladder to see.
      </p>
      <p>
        The other reason was the weather. That neighbourhood was windy every single day.
        The speed of a sprayer isn&apos;t always worth it, especially when the wind
        carries your paint onto somebody&apos;s car or the house next door. Overspray is a
        real problem that gets ignored. We prioritize quality over speed.
      </p>
    </ServicePage>
  );
}
