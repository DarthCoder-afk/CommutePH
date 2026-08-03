import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CommuteMap PH",
    template: "%s | CommuteMap PH",
  },
  description:
    "Find clear, verified public transport journeys in the Philippines.",
  applicationName: "CommuteMap PH",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8fafc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-PH" className={`${geistSans.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-950 antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
