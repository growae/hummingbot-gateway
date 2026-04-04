/**
 * Helper function for fetching token information from GeckoTerminal or on-chain
 * Shared logic between /tokens/find/:address and /tokens/save/:address
 */

import axios from 'axios';

import { CoinGeckoService } from '../services/coingecko-service';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { toTokenGeckoData } from '../services/gecko-types';
import { logger } from '../services/logger';

import { TokenInfo } from './schemas';

/**
 * Fetch token info from the Aeternity middleware (mdw) AEX-9 endpoint,
 * falling back to on-chain meta_info() if the middleware is unavailable.
 */
async function fetchAeternityTokenInfo(chainNetwork: string, address: string): Promise<TokenInfo> {
  const configManager = ConfigManagerV2.getInstance();

  let chainId = 0;
  try {
    chainId = configManager.getChainId(chainNetwork);
  } catch {
    // chainId not configured for aeternity — use 0
  }

  // Try middleware first: GET {nodeURL}/mdw/v3/aex9/{address}
  try {
    const nodeURL = configManager.get(`${chainNetwork}.nodeURL`) as string;
    const mdwUrl = `${nodeURL.replace(/\/$/, '')}/mdw/v3/aex9/${address}`;
    logger.info(`Fetching Aeternity token from middleware: ${mdwUrl}`);

    const { data } = await axios.get(mdwUrl, { timeout: 10000 });

    if (data && data.symbol) {
      logger.info(`Fetched Aeternity token via middleware: ${data.symbol} (${address})`);
      return {
        chainId,
        name: data.name || data.symbol,
        symbol: data.symbol,
        address: data.contract_id || address,
        decimals: typeof data.decimals === 'number' ? data.decimals : 18,
      };
    }
    logger.warn(`Middleware returned no symbol for ${address}, falling back to on-chain`);
  } catch (err: any) {
    logger.warn(`Middleware lookup failed for ${address}: ${err.message}, falling back to on-chain`);
  }

  // Fallback: on-chain meta_info() via SDK
  const { Aeternity } = await import('../chains/aeternity/aeternity');
  const network = chainNetwork.split('-').slice(1).join('-') || 'mainnet';
  const aeternity = await Aeternity.getInstance(network);
  const tokenInfo = await aeternity.getTokenInfo(address);

  if (!tokenInfo || !tokenInfo.symbol) {
    throw new Error(`Token not found on Aeternity: ${address}`);
  }

  logger.info(`Fetched Aeternity token on-chain: ${tokenInfo.symbol} (${tokenInfo.address})`);

  return {
    chainId,
    name: tokenInfo.name || tokenInfo.symbol,
    symbol: tokenInfo.symbol,
    address: tokenInfo.address,
    decimals: tokenInfo.decimals,
  };
}

/**
 * Fetch token information with market data from GeckoTerminal,
 * with on-chain fallback for chains not supported by GeckoTerminal (e.g., Aeternity)
 */
export async function fetchTokenInfo(chainNetwork: string, address: string): Promise<TokenInfo> {
  const chain = chainNetwork.split('-')[0];

  // Aeternity: fetch directly from the blockchain (GeckoTerminal doesn't support it)
  if (chain === 'aeternity') {
    return fetchAeternityTokenInfo(chainNetwork, address);
  }

  // All other chains: use GeckoTerminal
  const coinGeckoService = CoinGeckoService.getInstance();
  const tokenData = await coinGeckoService.getTokenInfoWithMarketData(chainNetwork, address);

  const configManager = ConfigManagerV2.getInstance();
  const chainId = configManager.getChainId(chainNetwork);

  const geckoData = toTokenGeckoData({
    coingeckoCoinId: tokenData.coingeckoCoinId,
    imageUrl: tokenData.imageUrl,
    priceUsd: tokenData.priceUsd,
    volumeUsd24h: tokenData.volumeUsd24h,
    marketCapUsd: tokenData.marketCapUsd,
    fdvUsd: tokenData.fdvUsd,
    totalSupply: tokenData.totalSupply,
    topPools: tokenData.topPools,
  });

  return {
    chainId,
    name: tokenData.name,
    symbol: tokenData.symbol,
    address: tokenData.address,
    decimals: tokenData.decimals,
    geckoData,
  };
}
