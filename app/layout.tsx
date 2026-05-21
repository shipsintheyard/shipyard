import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { WalletContextProvider } from "./providers";
import ChainProvider from "./providers/ChainProvider";
import EVMProvider from "./providers/EVMProvider";
import './globals.css';

export const metadata: Metadata = {
  title: "THE SHIPYARD | We Ship Widgets",
  description: "Build vessels that don't sink.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ChainProvider>
          <WalletContextProvider>
            <EVMProvider>
              {children}
            </EVMProvider>
          </WalletContextProvider>
        </ChainProvider>
        <Analytics />
      </body>
    </html>
  );
}
