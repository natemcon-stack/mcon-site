import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Roofing — outbuildings, managed subtrades and emergency leaks",
  description:
    "Asphalt shingle and metal cladding on sheds, garages and outbuildings. Insured subtrades for roofs over living space. Emergency leak mitigation on any roof.",
};

export default function Page() {
  return (
    <ServicePage
      title="Roofing"
      lede="What our crew installs, what we arrange through our subtrades, and what we'll come out for when a roof is already leaking."
      photos={[
        { src: "/images/roofing-1.jpg", alt: "Metal roofing installed on a large outbuilding" },
        { src: "/images/roofing-2.jpg", alt: "A completed metal roof on an auxiliary building" },
      ]}
    >
      <h2>Residential and commercial roofing</h2>
      <p>
        We use our preferred roofing subcontractors, who carry all the proper insurance
        for your project. As your general contractor, we&apos;re happy to arrange and
        manage that work for you.
      </p>

      <h2>What our own crew installs</h2>
      <p>
        Asphalt shingle and metal cladding on sheds, garages and auxiliary buildings —
        barns, carports, deck covers and the like. Anything that isn&apos;t over a living
        space.
      </p>

      <h2>Emergency leak mitigation</h2>
      <p>
        We take on emergency leak mitigation on existing roofs of any type, residential or
        commercial.
      </p>
    </ServicePage>
  );
}
