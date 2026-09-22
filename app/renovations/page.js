import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Renovations in Powell River — kitchens, bathrooms and basements",
  description:
    "Full renovations on the Upper Sunshine Coast: hazardous materials testing, demolition, framing, subtrades, permitting, flooring and cabinets, down to the last trim.",
};

export default function Page() {
  return (
    <ServicePage
      title="Renovations, start to finish"
      lede="Many renovations need stripping back to framing. There's no point updating the look if the structure behind it isn't sound."
      photos={[
        {
          src: "/images/renovations-1.jpg",
          alt: "A renovated Westview kitchen with white cabinets and a fir tongue-and-groove ceiling",
          caption:
            "A full kitchen renovation in Westview, in a house originally moved up from Townsite in the 1950s. We laid new floor sheeting — plywood, glued and screwed — then luxury vinyl plank over it. New plywood cabinets with European soft-close hinges and extra-tall pantries, new laminate countertops, and a tongue-and-groove fir ceiling. We also resized the window to open up the view over the deck.",
        },
        {
          src: "/images/renovations-2.jpg",
          alt: "A rebuilt kitchen with white cabinets and tongue-and-groove walls in a 1930s house",
          caption:
            "A 1930s house rebuilt one stick at a time. Walls and ceilings are tongue-and-groove rather than drywall, with a new plywood box kitchen and laminate counters.",
        },
        {
          src: "/images/renovations-3.jpg",
          alt: "Sections of an interior wall removed to open a kitchen to the living space",
          caption:
            "Opening up an older Williams Lake home. Removing sections of the wall rather than the whole thing gave the client the open-concept feel they wanted, without new flooring on both sides or the near-impossible job of matching old drywall texture. Taken to paint-ready drywall — the owners wanted to do the painting themselves.",
        },
      ]}
    >
      <p>
        We help you design the layout, plan the plumbing and electrical, and make sure
        everything is in place before anything gets closed up.
      </p>

      <h2>What we handle</h2>
      <ul>
        <li>Hazardous materials testing, based on the age of your home — required for anything built before 1994</li>
        <li>Demolition and framing</li>
        <li>Subtrades: plumbing, electrical and HVAC</li>
        <li>Permitting and inspection coordination</li>
        <li>Flooring, cabinets and countertops</li>
        <li>Down to the last piece of trim and the final paint touch-up</li>
      </ul>

      <h2>Pricing a renovation</h2>
      <p>
        Where the scope is known, we&apos;ll give you a firm price. Where it isn&apos;t —
        and with older homes, think Townsite, it often isn&apos;t known until the walls
        are open — we can either give you an estimate with a set contingency built in, or
        invoice weekly so you know exactly where your money is going.
      </p>

      <h2>When a rebuild beats a new build</h2>
      <p>
        One of these started as a basic renovation and became something else entirely.
        Asbestos remediation, chimney removal, and eventually 90% of the framing
        replaced &mdash; along with all new insulation, building envelope, windows, doors
        and siding, a new bathroom, new plumbing, and a new 200 amp electrical panel.
      </p>
      <p>
        You might reasonably ask why the owner didn&apos;t just build new. Local setback
        guidelines wouldn&apos;t allow it: a storm water connection runs through the
        middle of the property, and it&apos;s a corner lot with roads on two sides. So we
        worked with the city to permit the whole thing and rebuilt the house in place,
        including pouring a new foundation under the third of it that had been sitting on
        deck blocks for around ninety years.
      </p>

      <h2>The wall that wasn&apos;t structural</h2>
      <p>
        Another client had been told by other contractors that the wall between their
        kitchen and living space was structural and couldn&apos;t come out.
      </p>
      <p>
        We evaluated the trusses and found it wasn&apos;t load-bearing &mdash; the wall
        could have gone entirely. But we suggested removing only sections of it, which
        gave them the open feel they were after while avoiding new flooring on both sides
        and the cost of matching decades-old drywall texture. Cheaper, faster, and the
        result they actually wanted.
      </p>

      <h2>Renovate for yourself</h2>
      <p>
        Your home is your home. Finish it however you like. Design trends come and go
        &mdash; what&apos;s your style? What do you actually like?
      </p>
      <p>
        Don&apos;t renovate for resale value. We say that not because we dislike the look
        of it, but because some people are told the investment isn&apos;t worth it in a
        mobile home. Renovate for you. There&apos;s no point owning a home you don&apos;t
        like living in.
      </p>

      <h2>A word on flooring</h2>
      <p>
        If your contractor doesn&apos;t check the flatness and expansion gap tolerances
        for your flooring before installing it, don&apos;t let them install it &mdash; or
        at minimum, make sure they guarantee the work and will stand behind it. They
        should also acclimate your flooring on site for the length of time the
        manufacturer recommends before it goes down.
      </p>
    </ServicePage>
  );
}
