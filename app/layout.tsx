import type { Metadata, Viewport } from "next";
import { Fragment_Mono, Instrument_Sans } from "next/font/google";
import { meta, SHOW_GITHUB } from "@/lib/content";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Fragment_Mono({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(meta.url),
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "profile",
    url: "/",
    siteName: meta.name,
    title: meta.title,
    description: meta.description,
  },
  twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
};

export const viewport: Viewport = {
  themeColor: "#DCE6F2",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: meta.name,
  url: meta.url,
  email: `mailto:${meta.email}`,
  description: meta.description,
  affiliation: { "@type": "CollegeOrUniversity", name: "Thapar Institute of Engineering & Technology" },
  sameAs: [meta.linkedin, meta.fiverr, ...(SHOW_GITHUB ? [meta.github] : [])],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  );
}
