import type { Metadata, Viewport } from "next";
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
  title: "DJSynth",
  description: "Contrôleur DJ web : decks, mixer, FX, stems, synthé",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    // "Ajouter à l'écran d'accueil" on iPhone/iPad then launches full-screen,
    // no Safari chrome — this is also what makes background playback behave
    // best (see the wake-lock note in page.tsx), not just cosmetics.
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DJSynth",
  },
};

// Without this, mobile Safari renders the desktop layout shrunk to fit and
// blocks pinch-zoom by default — on a dense hardware-style UI like this one,
// pinch-zoom is how an iPhone user actually reaches small knobs/buttons, so
// it's left enabled (maximumScale up, userScalable not disabled).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
