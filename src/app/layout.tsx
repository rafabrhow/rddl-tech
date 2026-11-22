import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConfirmProvider } from "@/components/confirm/ConfirmProvider";
import PWARegister from "@/components/pwa/PWARegister";

export const metadata: Metadata = {
  title: "TeixaCell | Gestão Inteligente",
  description: "Plataforma de gestão inteligente para assistências técnicas.",
  applicationName: "TeixaCell",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "TeixaCell",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <ConfirmProvider>
          <PWARegister />
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}
