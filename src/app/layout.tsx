import type { Metadata, Viewport } from "next";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: "Washington Contract Explorer",
  description: "Find open public works opportunities across Washington, see how each fits your business, and contact the agency.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0f1520" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
