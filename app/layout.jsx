import { Web3Providers } from './providers/Web3Providers';

export const metadata = {
  title: 'RefiFi — DeFi Debt Refinance',
  description: 'Escape 22% credit card interest. Borrow against your crypto at 2.4% APR.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#04060f' }}>
        <Web3Providers>
          {children}
        </Web3Providers>
      </body>
    </html>
  );
}
