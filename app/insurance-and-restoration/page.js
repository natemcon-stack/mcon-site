import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Insurance restoration — flooding and water damage",
  description:
    "Water removal, documented moisture testing and full subtrade coordination after an insurance claim in Powell River and the qathet region.",
};

export default function Page() {
  return (
    <ServicePage
      title="Restoration after an insurance claim"
      lede="Flooding, water damage and the rebuild that follows."
      photos={[
        { src: "/images/restoration-1.jpg", alt: "Water damage restoration by M-CON Enterprises" },
      ]}
    >
      <p>
        We handle the work end to end: water removal, documented moisture testing through
        to the space being confirmed dry, and coordination of all subtrades — hazardous
        materials testing, flooring, appliances, electrical — so you&apos;re not chasing
        four contractors while living in a damaged home.
      </p>

      <h2>Working with your insurer</h2>
      <p>
        We work with whoever your insurer is. We&apos;re not on insurer preferred vendor
        lists, because we don&apos;t use Xactimate estimating software — but we&apos;re
        happy to price competitively against the contractors who are, and you&apos;ll get
        an itemised invoice and damage report your adjuster can read.
      </p>
      <p>
        Insurance companies often require multiple quotes. Other than us, your options
        locally are SJS Restorations — we have nothing but good things to say about Jim
        and his crew — or Edeo Restorations, formerly WinMar Powell River, who have all
        the skills required.
      </p>

      <h2>After-hours work</h2>
      <p>
        We take on emergency and restoration work, but we can&apos;t guarantee after-hours
        availability. After-hours call-outs are billed at a minimum two hours at $150 per
        man hour.
      </p>
    </ServicePage>
  );
}
