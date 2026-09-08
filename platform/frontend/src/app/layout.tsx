import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Reverse Boolean Lab",
  description: "Turn known buyers into evidence-backed search strategies.",
  openGraph: {
    title: "Reverse Boolean Lab",
    description: "Turn known buyers into evidence-backed search strategies.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Reverse Boolean Lab — Buyer intelligence workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reverse Boolean Lab",
    description: "Turn known buyers into evidence-backed search strategies.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
