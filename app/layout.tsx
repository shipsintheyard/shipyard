import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { WalletContextProvider } from "./providers";

export const metadata: Metadata = {
  title: "THE SHIPYARD | We Ship Widgets",
  description:
    "Zero dev extraction. Locked LP forever. Auto-compounding fees. Build vessels that can't sink.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <WalletContextProvider>{children}</WalletContextProvider>
        <Analytics />
      </body>
    </html>
  );
}
