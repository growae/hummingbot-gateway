import { Type } from '@sinclair/typebox';

import { getAeternityChainConfig } from '../../chains/aeternity/aeternity.config';

import { SuperheroConfig } from './superhero.config';

const aeternityChainConfig = getAeternityChainConfig();

const BASE_TOKEN = 'AE';
const QUOTE_TOKEN = 'WAE';
const SWAP_AMOUNT = 1;
const POOL_ADDRESS_EXAMPLE = 'ct_pool_address_here';

export const SuperheroAmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The Aeternity network to use',
      default: aeternityChainConfig.defaultNetwork,
      enum: [...SuperheroConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Superhero DEX pair address (ct_ prefix)',
    examples: [POOL_ADDRESS_EXAMPLE],
  }),
});

export const SuperheroAmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      default: aeternityChainConfig.defaultNetwork,
      enum: [...SuperheroConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({ description: 'Pool address (optional — can be looked up from tokens)' }),
  ),
  baseToken: Type.String({ description: 'Base token symbol or contract address', examples: [BASE_TOKEN] }),
  quoteToken: Type.Optional(
    Type.String({ description: 'Quote token symbol or contract address', examples: [QUOTE_TOKEN] }),
  ),
  amount: Type.Number({ description: 'Amount to swap', examples: [SWAP_AMOUNT] }),
  side: Type.String({ enum: ['BUY', 'SELL'], default: 'SELL' }),
  slippagePct: Type.Optional(
    Type.Number({ minimum: 0, maximum: 100, default: SuperheroConfig.config.slippagePct }),
  ),
});

export const SuperheroAmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({ default: aeternityChainConfig.defaultWallet }),
  ),
  network: Type.Optional(
    Type.String({ default: aeternityChainConfig.defaultNetwork, enum: [...SuperheroConfig.networks] }),
  ),
  poolAddress: Type.Optional(Type.String({ default: '' })),
  baseToken: Type.String({ examples: [BASE_TOKEN] }),
  quoteToken: Type.Optional(Type.String({ examples: [QUOTE_TOKEN] })),
  amount: Type.Number({ examples: [SWAP_AMOUNT] }),
  side: Type.String({ enum: ['BUY', 'SELL'], default: 'SELL' }),
  slippagePct: Type.Optional(
    Type.Number({ minimum: 0, maximum: 100, default: SuperheroConfig.config.slippagePct }),
  ),
});

export const SuperheroAmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({ default: aeternityChainConfig.defaultNetwork, enum: [...SuperheroConfig.networks] }),
  ),
  walletAddress: Type.Optional(Type.String({ default: aeternityChainConfig.defaultWallet })),
  poolAddress: Type.String({ description: 'Address of the Superhero DEX pair' }),
  baseTokenAmount: Type.Number({ description: 'Amount of base token to add' }),
  quoteTokenAmount: Type.Number({ description: 'Amount of quote token to add' }),
  slippagePct: Type.Optional(
    Type.Number({ minimum: 0, maximum: 100, default: SuperheroConfig.config.slippagePct }),
  ),
});

export const SuperheroAmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({ default: aeternityChainConfig.defaultNetwork, enum: [...SuperheroConfig.networks] }),
  ),
  walletAddress: Type.Optional(Type.String({ default: aeternityChainConfig.defaultWallet })),
  poolAddress: Type.String({ description: 'Address of the Superhero DEX pair' }),
  percentageToRemove: Type.Number({ minimum: 0, maximum: 100, description: 'Percentage of LP to remove' }),
});
