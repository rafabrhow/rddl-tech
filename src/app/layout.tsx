import type { Metadata } from "next";
import "./globals.css";
import { ConfirmProvider } from "@/components/confirm/ConfirmProvider";
export const metadata: Metadata = {
  title: "RDDL TECH | Gestão Inteligente",
  description: "Plataforma de gestão inteligente para assistências técnicas."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><ConfirmProvider>{children}</ConfirmProvider></body></html>;
}
