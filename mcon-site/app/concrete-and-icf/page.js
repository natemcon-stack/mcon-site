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
        { src: "/images/icf-1.jpg", alt: "Insulated concrete forms set for a new foundation" },
        { src: "/images/concrete-1.jpg", alt: "Formwork and a concrete pour underway" },
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
