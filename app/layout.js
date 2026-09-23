import "./globals.css";
import { brand } from "@/lib/brand";

export const metadata = {
  title: `${brand.shortName} ${brand.appName}`,
  description: brand.appDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: brand.appName,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#1B2430",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-body min-h-screen bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
