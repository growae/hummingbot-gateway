import {
  DEX_ADDRESSES,
  getSuperheroRouterAddress,
  getSuperheroFactoryAddress,
  getSuperheroWaeAddress,
  MINIMUM_LIQUIDITY,
} from '../../../src/connectors/superhero/superhero.contracts';

describe('superhero.contracts', () => {
  describe('DEX_ADDRESSES', () => {
    it('has mainnet addresses', () => {
      expect(DEX_ADDRESSES).toHaveProperty('mainnet');
      const mainnet = DEX_ADDRESSES.mainnet;
      expect(mainnet.factory).toMatch(/^ct_/);
      expect(mainnet.router).toMatch(/^ct_/);
      expect(mainnet.wae).toMatch(/^ct_/);
    });
  });

  describe('getSuperheroRouterAddress', () => {
    it('returns the router address for mainnet', () => {
      expect(getSuperheroRouterAddress('mainnet')).toBe(DEX_ADDRESSES.mainnet.router);
    });

    it('throws for unknown network', () => {
      expect(() => getSuperheroRouterAddress('unknown')).toThrow('No DEX addresses configured');
    });
  });

  describe('getSuperheroFactoryAddress', () => {
    it('returns the factory address for mainnet', () => {
      expect(getSuperheroFactoryAddress('mainnet')).toBe(DEX_ADDRESSES.mainnet.factory);
    });

    it('throws for unknown network', () => {
      expect(() => getSuperheroFactoryAddress('unknown')).toThrow('No DEX addresses configured');
    });
  });

  describe('getSuperheroWaeAddress', () => {
    it('returns the WAE address for mainnet', () => {
      expect(getSuperheroWaeAddress('mainnet')).toBe(DEX_ADDRESSES.mainnet.wae);
    });

    it('throws for unknown network', () => {
      expect(() => getSuperheroWaeAddress('unknown')).toThrow('No DEX addresses configured');
    });
  });

  describe('MINIMUM_LIQUIDITY', () => {
    it('is 1000n', () => {
      expect(MINIMUM_LIQUIDITY).toBe(1000n);
    });
  });
});
