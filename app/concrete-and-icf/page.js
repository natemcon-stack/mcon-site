import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Concrete and ICF foundations in Powell River",
  description:
    "Foundations, slabs, footings and flatwork built with insulated concrete forms — thermally efficient, sound deadening, with built-in fastening strips.",
};

export default function Page() {
  return (
    <ServicePage
      title="Concrete and ICF foundations"
      lede="Foundations, slabs, footings and flatwork, formed with insulated concrete forms."
      photos={[
        {
          src: "/images/icf-1.jpg",
          alt: "Insulated concrete forms and sonotube footings set for a log shop",
          caption:
            "At Frontier Estates in 150 Mile House. The owner had already contracted a log structure to be delivered for a shop, so we worked to those drawings to place the footings and sonotubes precisely and build the ICF wall the logs would sit on. The redi-rod for bolting the logs down went in during the pour. We brought our own backhoe, excavated to grade and finalized elevations. This one went as smoothly as it could have.",
        },
        {
          src: "/images/concrete-1.jpg",
          alt: "A concrete pour underway on an ICF wall and sonotube footings",
          caption:
            "The pour at 150 Mile House. The ICF wall and sonotubes are braced and ready, with the existing log home behind — the new shop was built to match it.",
        },
      ]}
    >
      <p>
        ICF makes your home more thermally efficient and deadens sound, and the forms have
        built-in fastening strips for siding on the outside and interior finishes like
        drywall on the inside.
      </p>
      <p>
        Forming is less labour intensive with ICF, and so is stripping. The extra cost of
        the forms is made up for in the ease of set-up, and in not needing interior
        insulation or back framing inside afterwards.
      </p>
      <p>
        That&apos;s why we don&apos;t typically offer traditional formwork. For most
        builds here, ICF is simply the better result for the money.
      </p>
    </ServicePage>
  );
}
