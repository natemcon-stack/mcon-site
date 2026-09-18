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
        { src: "/images/renovations-1.jpg", alt: "A renovated kitchen with a cedar ceiling and full-height cabinets" },
        { src: "/images/renovations-2.jpg", alt: "A renovated kitchen with white cabinets and dark countertops" },
        { src: "/images/renovations-3.jpg", alt: "Interior framing for a new partition during a renovation" },
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
        <li>Permitting</li>
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
    </ServicePage>
  );
}
