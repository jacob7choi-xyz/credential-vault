import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, polygon, sepolia } from 'wagmi/chains'
import { defineChain } from 'viem'

// Define Hardhat localhost network
export const hardhatLocal = defineChain({
  id: 1337,
  name: 'Hardhat Local',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
})

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'default-project-id'

export const wagmiConfig = getDefaultConfig({
  appName: 'Credential Vault',
  projectId,
  chains: [hardhatLocal, sepolia, mainnet, polygon],
  ssr: true,
})
