import {
  toAettos,
  fromAettos,
  addSlippage,
  subSlippage,
  formatTokenAmount,
  estimateRemovalMinimums,
} from '../../../src/connectors/superhero/superhero.utils';

describe('superhero.utils', () => {
  describe('toAettos', () => {
    it('converts 1.0 to 10^18 with default decimals', () => {
      expect(toAettos('1', 18)).toBe(10n ** 18n);
    });

    it('converts fractional amounts correctly', () => {
      expect(toAettos('0.5', 18)).toBe(5n * 10n ** 17n);
    });

    it('handles 6-decimal tokens', () => {
      expect(toAettos('1', 6)).toBe(1_000_000n);
      expect(toAettos('123.456', 6)).toBe(123_456_000n);
    });

    it('returns 0n for falsy input', () => {
      expect(toAettos('', 18)).toBe(0n);
      expect(toAettos(0, 18)).toBe(0n);
    });

    it('truncates (rounds down) sub-unit remainders', () => {
      expect(toAettos('1.0000000000000000009', 18)).toBe(10n ** 18n);
    });

    it('accepts numeric input', () => {
      expect(toAettos(2, 18)).toBe(2n * 10n ** 18n);
    });
  });

  describe('fromAettos', () => {
    it('converts 10^18 back to 1', () => {
      expect(fromAettos(10n ** 18n, 18)).toBe(1);
    });

    it('converts 6-decimal raw amounts', () => {
      expect(fromAettos(1_500_000n, 6)).toBe(1.5);
    });

    it('handles zero', () => {
      expect(fromAettos(0n, 18)).toBe(0);
    });
  });

  describe('addSlippage', () => {
    it('adds 1% slippage', () => {
      const base = 1_000_000n;
      const result = addSlippage(base, 1);
      expect(result).toBe(1_010_000n);
    });

    it('adds 0.5% slippage', () => {
      const base = 1_000_000n;
      const result = addSlippage(base, 0.5);
      expect(result).toBe(1_005_000n);
    });

    it('returns the same value when slippage is 0', () => {
      const base = 1_000_000n;
      expect(addSlippage(base, 0)).toBe(base);
    });
  });

  describe('subSlippage', () => {
    it('subtracts 1% slippage', () => {
      const base = 1_000_000n;
      const result = subSlippage(base, 1);
      expect(result).toBe(990_000n);
    });

    it('subtracts 0.5% slippage', () => {
      const base = 1_000_000n;
      const result = subSlippage(base, 0.5);
      expect(result).toBe(995_000n);
    });

    it('returns the same value when slippage is 0', () => {
      const base = 1_000_000n;
      expect(subSlippage(base, 0)).toBe(base);
    });
  });

  describe('formatTokenAmount', () => {
    it('formats 18-decimal raw amount', () => {
      expect(formatTokenAmount(10n ** 18n, 18)).toBe(1);
    });

    it('formats string input', () => {
      expect(formatTokenAmount('1500000', 6)).toBe(1.5);
    });

    it('formats zero', () => {
      expect(formatTokenAmount(0n, 18)).toBe(0);
    });
  });

  describe('estimateRemovalMinimums', () => {
    const reserveA = 1_000_000n;
    const reserveB = 2_000_000n;
    const totalSupply = 1_000_000n;
    const slippagePct = 1;

    it('calculates proportional minimums for 50% LP burn', () => {
      const lpToBurn = 500_000n;
      const { minA, minB } = estimateRemovalMinimums(reserveA, reserveB, totalSupply, lpToBurn, slippagePct);
      // Expected amounts = 500_000 and 1_000_000 before slippage
      // After 1% slippage: 500_000 - 5_000 = 495_000 and 1_000_000 - 10_000 = 990_000
      expect(minA).toBe(495_000n);
      expect(minB).toBe(990_000n);
    });

    it('returns zeros when totalSupply is 0', () => {
      const { minA, minB } = estimateRemovalMinimums(reserveA, reserveB, 0n, 500_000n, slippagePct);
      expect(minA).toBe(0n);
      expect(minB).toBe(0n);
    });

    it('returns zeros when lpToBurn is 0', () => {
      const { minA, minB } = estimateRemovalMinimums(reserveA, reserveB, totalSupply, 0n, slippagePct);
      expect(minA).toBe(0n);
      expect(minB).toBe(0n);
    });
  });
});
