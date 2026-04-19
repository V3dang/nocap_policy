import type { Metadata } from "next";
import { Archivo_Black, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo_Black({
  variable: "--font-header",
  weight: "400",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NoCap Policy Dashboard",
  description: "Gen Z policy intelligence interface",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-pitch">
      <body className={`${archivo.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
