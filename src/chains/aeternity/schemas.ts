import { Type } from '@sinclair/typebox';

import { getAeternityChainConfig, networks as AeternityNetworks } from './aeternity.config';

const aeternityChainConfig = getAeternityChainConfig();

export const AeternityNetworkParameter = Type.Optional(
  Type.String({
    description: 'The Aeternity network to use',
    default: aeternityChainConfig.defaultNetwork,
    enum: AeternityNetworks,
  }),
);

export const AeternityAddressParameter = Type.Optional(
  Type.String({
    description: 'Aeternity wallet address (ak_ prefix)',
    default: aeternityChainConfig.defaultWallet,
  }),
);

export const AeternityStatusRequest = Type.Object({
  network: AeternityNetworkParameter,
});

export const AeternityBalanceRequest = Type.Object({
  network: AeternityNetworkParameter,
  address: AeternityAddressParameter,
  tokens: Type.Optional(
    Type.Array(Type.String(), {
      description: 'A list of AEX9 token contract addresses (ct_ prefix)',
    }),
  ),
});

export const AeternityPollRequest = Type.Object({
  network: AeternityNetworkParameter,
  signature: Type.String({
    description: 'Transaction hash to poll',
    examples: ['th_2mfj3FoZxnhkSw5RZMcP8BfPoB1QR4QiYGNCdkAvLZ1zfF6paW'],
  }),
});
