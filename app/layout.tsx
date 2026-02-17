import type { Metadata } from "next";
import "./globals.css";
import SolanaProviders from "../components/SolanaProviders";

export const metadata: Metadata = {
  title: "ECHO Miner",
  description: "High-performance Solana mining simulator.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-white antialiased">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}


