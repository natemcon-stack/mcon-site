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
        { src: "/images/commercial-1.jpg", alt: "A commercial tenant improvement by M-CON Enterprises" },
      ]}
      rates={[{ label: "Commercial labour", value: "$110 per man hour" }]}
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
    </ServicePage>
  );
}
