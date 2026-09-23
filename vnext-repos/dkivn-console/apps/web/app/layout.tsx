import type { Metadata } from "next";
import "./globals.css";
import { SystemHeader } from "../components/system-header";

export const metadata: Metadata = {
  title: "DKIVN VNext",
  description: "DKIVN production control and observability console",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>
        <SystemHeader />
        {children}
      </body>
    </html>
  );
}
