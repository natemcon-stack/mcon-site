import { brand } from "@/lib/brand";

// Served at /manifest.webmanifest. This was a static public/manifest.json, but the
// PWA name is per-instance, so it's generated from the brand env vars instead —
// otherwise every deployment would install to the crew's home screen under the
// wrong company's name.
export default function manifest() {
  return {
    name: `${brand.shortName} ${brand.appName}`,
    short_name: brand.shortName,
    description: brand.appDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#F5F6F7",
    theme_color: "#1B2430",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
