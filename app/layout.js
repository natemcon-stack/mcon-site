import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CallBar from "@/components/CallBar";

export const metadata = {
  metadataBase: new URL("https://mconenterprisesinc.ca"),
  title: {
    default: "M-CON Enterprises Inc. — Renovations, builds and restoration in Powell River",
    template: "%s — M-CON Enterprises Inc.",
  },
  description:
    "Renovations, new builds, decks, concrete and insurance restoration on the Upper Sunshine Coast. Published rates, weekly invoicing, red seal carpentry.",
  openGraph: { type: "website", locale: "en_CA", siteName: "M-CON Enterprises Inc." },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-CA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
          rel="stylesheet"
        />
        {/* LocalBusiness markup, because nearly everything people search here is local
            — "contractor Powell River" and the like. This is what puts the phone number
            and service area into a search result rather than leaving Google to guess. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "GeneralContractor",
              name: "M-CON Enterprises Inc.",
              telephone: "+1-778-230-7676",
              email: "office@mconenterprisesinc.ca",
              url: "https://mconenterprisesinc.ca",
              address: {
                "@type": "PostalAddress",
                streetAddress: "3870 Highway 101",
                addressLocality: "Powell River",
                addressRegion: "BC",
                postalCode: "V8A 0C6",
                addressCountry: "CA",
              },
              areaServed: [
                "Powell River", "qathet Regional District", "Texada Island",
                "Lund", "Saltery Bay", "British Columbia",
              ],
              foundingDate: "2015",
            }),
          }}
        />
      </head>
      <body className="font-body pb-14 sm:pb-0">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:m-3 focus:bg-ink focus:text-paper focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <CallBar />
      </body>
    </html>
  );
}
