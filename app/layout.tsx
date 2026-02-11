
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// Explicitly import React to resolve namespace issues for React.ReactNode in the type definition
import React from 'react';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ECHO Miner",
  description: "High-performance Solana mining simulator.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-background text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
