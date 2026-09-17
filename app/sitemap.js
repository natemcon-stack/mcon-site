import { SERVICES } from "@/lib/services";

const BASE = "https://mconenterprisesinc.ca";

export default function sitemap() {
  const pages = ["", "/about", "/faq", "/contact", ...SERVICES.map((s) => `/${s.slug}`)];
  return pages.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
