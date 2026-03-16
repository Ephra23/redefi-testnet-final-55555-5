'use client';

import { RainbowKitProvider, getDefaultConfig, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useChainId } from 'wagmi';
import { mainnet, base, arbitrum, sepolia, baseSepolia, optimism, polygon } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
  appName: 'RefiFi',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || '6f9dccf5dab9008bb844b363033ad409',
  chains: [
    mainnet, base, arbitrum, optimism, polygon,
    sepolia, baseSepolia,
  ],
  ssr: true,
});

const queryClient = new QueryClient();

function ThemedRainbowKit({ children, appTheme }) {
  const chainId = useChainId();
  const isTestnet = chainId === 11155111 || chainId === 84532;
  const accentColor = isTestnet ? '#9945FF' : (appTheme?.accent || '#4fffb0');
  const isDark = appTheme?.mode !== 'light';

  const theme = isDark
    ? darkTheme({ accentColor, accentColorForeground: isTestnet?'#ffffff':'#04060f', borderRadius:'large', fontStack:'system', overlayBlur:'small' })
    : lightTheme({ accentColor, accentColorForeground:'#ffffff', borderRadius:'large', fontStack:'system' });

  return (
    <RainbowKitProvider theme={theme} showRecentTransactions={true}>
      {children}
    </RainbowKitProvider>
  );
}

export function Web3Providers({ children, appTheme }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemedRainbowKit appTheme={appTheme}>
          {children}
        </ThemedRainbowKit>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
