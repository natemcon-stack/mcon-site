/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf.js must be left OUT of the server bundle.
  //
  // Even with no worker thread, pdf.js loads its parsing engine by requiring
  // './pdf.worker.js' at runtime — the "fake worker" path. Next bundles the library and
  // that sibling file isn't traced with it, so on Vercel every extraction died with
  // `Setting up fake worker failed: "Cannot find module './pdf.worker.js'"`.
  //
  // Marking it external leaves it in node_modules where the require can find it. This
  // is why receipt PDFs parsed perfectly in testing and not at all in production.
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};
export default nextConfig;
