/** @type {import('next').NextConfig} */

// Redirects from the old LinkNow URL structure.
//
// The old site had 142 pages, including 95 templated location pages — a page per service
// per town. Those are consolidated here, but every old URL still has to resolve: links
// from directories, Google's index and anything a past client bookmarked all point at
// them. A 301 passes the accumulated ranking to the new page; a 404 throws it away.
const redirects = [
  // Service pages under their old paths
  ["/services/kitchen-renovations", "/renovations"],
  ["/services/bathroom-renovations", "/renovations"],
  ["/renovations/basement-renovations", "/renovations"],
  ["/services/countertop-installation", "/renovations"],
  ["/services/hardwood-flooring", "/renovations"],
  ["/services/home-improvement", "/renovations"],
  ["/services/home-repair", "/renovations"],
  ["/construction/framing", "/framing-and-carpentry"],
  ["/services/carpentry", "/framing-and-carpentry"],
  ["/construction/new-construction", "/new-builds"],
  ["/services/garages", "/new-builds"],
  ["/services/deck-construction", "/decks-siding-and-exterior"],
  ["/services/siding", "/decks-siding-and-exterior"],
  ["/services/window-installation", "/decks-siding-and-exterior"],
  ["/services/door-services", "/decks-siding-and-exterior"],
  ["/services/fencing", "/decks-siding-and-exterior"],
  ["/services/gutter-services", "/faq"],
  ["/construction/concrete", "/concrete-and-icf"],
  ["/services/foundations", "/concrete-and-icf"],
  ["/services/roofing", "/roofing"],
  ["/services/commercial-roof-repair", "/roofing"],
  ["/services/chimney-removal", "/faq"],
  ["/services/insurance-emergency-work-and-rebuilds", "/insurance-and-restoration"],
  ["/services/commercial", "/commercial"],
  ["/services/general-contractor", "/"],
  ["/services/construction-contractor", "/"],
  ["/services/renovation-contractor", "/"],
  ["/services/storage-facilities", "/"],
  ["/services/rental-equipment", "/insurance-and-restoration"],
  ["/services/real-estate-transaction-quotes", "/contact"],
  ["/about-us", "/about"],
  ["/about-us/testimonials", "/about"],
  ["/about-us/gallery", "/"],
  ["/contact-us", "/contact"],
  ["/blog", "/"],
];

const nextConfig = {
  async redirects() {
    return [
      ...redirects.map(([source, destination]) => ({ source, destination, permanent: true })),
      // Every location landing page folded into its service. The old structure was
      // /areas-of-service/<town>-<service>, so one wildcard catches all 95 rather than
      // listing them — they were templated from the same copy anyway.
      { source: "/areas-of-service/:slug*", destination: "/", permanent: true },
      { source: "/services/:slug*", destination: "/", permanent: true },
      { source: "/construction/:slug*", destination: "/", permanent: true },
      { source: "/renovations/:slug*", destination: "/renovations", permanent: true },
    ];
  },
};

export default nextConfig;
