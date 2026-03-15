import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace SuperheroConfig {
  export const chain = 'aeternity';
  export const networks = ['mainnet'];
  export const tradingTypes = ['amm'] as const;
  export const config = {
    slippagePct: ConfigManagerV2.getInstance().get('superhero.slippagePct') ?? 1,
    availableNetworks: [{ chain, networks }],
  };
}
