import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Water Quality Prediction System',
  description:
    'AI-powered water quality analysis and prediction using Machine Learning. ' +
    'Real-time water safety assessment, batch predictions, and interactive What-If simulator.',
  keywords: ['water quality', 'prediction', 'machine learning', 'AI', 'water safety', 'potability'],
  authors: [{ name: 'Smart Water Quality System' }],
  robots: 'index, follow',
  openGraph: {
    title: 'Smart Water Quality Prediction System',
    description: 'AI-powered water safety screening and analysis platform.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="slate-tech" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
