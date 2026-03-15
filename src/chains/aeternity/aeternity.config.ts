import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface AeternityNetworkConfig {
  nodeURL: string;
  compilerURL: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  swapProvider?: string;
}

export interface AeternityChainConfig {
  defaultNetwork: string;
  defaultWallet: string;
}

export const networks = ['mainnet', 'testnet'];

export function getAeternityNetworkConfig(network: string): AeternityNetworkConfig {
  const namespaceId = `aeternity-${network}`;
  return {
    nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
    compilerURL: ConfigManagerV2.getInstance().get(namespaceId + '.compilerURL'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    nativeCurrencyDecimals: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencyDecimals'),
    swapProvider: ConfigManagerV2.getInstance().get(namespaceId + '.swapProvider'),
  };
}

export function getAeternityChainConfig(): AeternityChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('aeternity.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('aeternity.defaultWallet'),
  };
}
