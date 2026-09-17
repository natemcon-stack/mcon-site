// The service list, in one place. Drives the nav, the home page, the sitemap and the
// service pages themselves, so adding or removing a service is a single edit rather
// than four files that drift apart.

export const SERVICES = [
  { slug: "renovations", title: "Renovations", blurb: "Kitchens, bathrooms and basements, stripped back to framing where they need to be." },
  { slug: "framing-and-carpentry", title: "Framing and carpentry", blurb: "New builds, additions, structural alterations and the finish work after." },
  { slug: "new-builds", title: "New builds", blurb: "Carports, garages, barns and shops. New homes only for certified owner builders." },
  { slug: "decks-siding-and-exterior", title: "Decks, siding and exterior", blurb: "Decks, siding, windows, doors and garage doors." },
  { slug: "concrete-and-icf", title: "Concrete and ICF", blurb: "Foundations, slabs and flatwork, formed with insulated concrete forms." },
  { slug: "roofing", title: "Roofing", blurb: "Shingle and metal on outbuildings, managed subtrades above living space, emergency leaks." },
  { slug: "insurance-and-restoration", title: "Insurance and restoration", blurb: "Flooding, water damage and the rebuild, with your insurer." },
  { slug: "commercial", title: "Commercial", blurb: "Landlord build-backs, tenant improvements and ongoing maintenance." },
  { slug: "rollout-projects", title: "Rollout projects", blurb: "The same task at twenty sites, on a schedule, across British Columbia." },
];

export const RATES = [
  { label: "Regular hours, residential", value: "$100", unit: "per man hour" },
  { label: "Regular hours, commercial", value: "$110", unit: "per man hour" },
  { label: "After-hours call-out", value: "$150", unit: "per man hour, 2 hour minimum" },
];

export const QUOTE_FEES = [
  { label: "Texada Island", value: "from $200" },
  { label: "Lower Sunshine Coast", value: "from $300" },
  { label: "Vancouver Island", value: "from $1,200" },
];

export const PHONE = "778-230-7676";
export const PHONE_HREF = "tel:+17782307676";
export const EMAIL = "office@mconenterprisesinc.ca";
