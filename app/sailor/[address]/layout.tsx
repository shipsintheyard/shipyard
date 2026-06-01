import type { Metadata } from 'next';

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `Sailor Stats | ${short}`,
    description: 'On-chain wallet stats — degen score, PnL, win rate, and more.',
    openGraph: {
      title: `Sailor Stats | ${short}`,
      description: 'Check your on-chain degen score',
      images: [`/api/og/${address}`],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Sailor Stats | ${short}`,
      description: 'On-chain wallet stats — degen score and more',
      images: [`/api/og/${address}`],
    },
  };
}

export default function SailorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
