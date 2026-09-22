import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Commercial construction and maintenance in Powell River",
  description:
    "Landlord build-backs, tenant improvements, permitting and development applications, plus yearly line painting, exterior painting and service work.",
};

export default function Page() {
  return (
    <ServicePage
      title="Commercial construction and maintenance"
      lede="Landlord build-backs and tenant improvements, from permitting through to handover."
      photos={[
        {
          src: "/images/commercial-1.jpg",
          alt: "A commercial prep kitchen with a two-basin stainless sink and spray nozzle",
          caption:
            "An upgrade to a commercial prep kitchen in Powell River. We sourced a commercial-grade two-basin stainless sink with a side drip tray that actually accommodated the washing space they needed, along with the spray nozzle, and one of our trusted subtrades handled the plumbing. If you need to upgrade a space, we'll find you what you need.",
        },
        {
          src: "/images/commercial-2.jpg",
          alt: "Exterior work from a scissor lift during an ownership changeover at a franchise location",
          caption:
            "An ownership changeover at a nationwide franchise. When owners change, corporate makes sure the building is up to par — we met their representative, went through the deficiency list, and once approved, completed all of it. Replacing ceiling tiles, evaluating emergency exits for functionality, replacing siding, exterior cleaning, prep and painting, and bollard painting.",
        },
      ]}
      rates={[{ label: "Commercial labour, based on", value: "$110 per man hour" }]}
    >
      <p>
        We work with the city on permitting and development applications, and with
        architects and engineers to meet local requirements. You get realistic cost
        estimates and professional subtrades.
      </p>

      <h2>Ongoing maintenance</h2>
      <p>
        Yearly line painting, commercial exterior painting, and general service work.
        Where your agreements require it, we&apos;ll add you to our insurance as an
        additional insured party.
      </p>
      <p>
        We carry a $5 million liability policy and up-to-date WorkSafeBC coverage.
      </p>

      <p>
        Commercial labour is based on $110 per man hour, but wherever the scope is known
        we&apos;d rather give you a firm quote.
      </p>
      <p>
        Whether your commercial space is in Powell River or not, we&apos;re happy to help
        &mdash; our rollout work takes us all across the province.
      </p>
    </ServicePage>
  );
}
