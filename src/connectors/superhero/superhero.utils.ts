import BigNumber from 'bignumber.js';

import {
  ACI,
  Aex9ContractApi,
  PairContractApi,
  initializeContractTyped,
} from './superhero.contracts';

export function toAettos(amount: string | number, decimals = 18): bigint {
  if (!amount) return 0n;
  const bn = new BigNumber(String(amount)).shiftedBy(decimals).integerValue(BigNumber.ROUND_DOWN);
  return BigInt(bn.toFixed(0));
}

export function fromAettos(aettos: bigint | number | string, decimals = 18): number {
  return new BigNumber(String(aettos)).shiftedBy(-decimals).toNumber();
}

export function addSlippage(amount: bigint, slippagePct: number): bigint {
  const a = new BigNumber(amount.toString());
  const res = a.multipliedBy(1 + slippagePct / 100).integerValue(BigNumber.ROUND_DOWN);
  return BigInt(res.toFixed(0));
}

export function subSlippage(amount: bigint, slippagePct: number): bigint {
  const scaledTenthPercent = BigInt(Math.round(slippagePct * 10));
  return amount - (amount * scaledTenthPercent) / 1000n;
}

export async function ensureAllowanceForRouter(
  sdk: any,
  tokenAddress: string,
  owner: string,
  needed: bigint,
  routerAddress: string,
): Promise<void> {
  const token = await initializeContractTyped<Aex9ContractApi>(sdk, {
    aci: ACI.AEX9,
    address: tokenAddress,
  });
  const forAccount = routerAddress.replace('ct_', 'ak_');
  const { decodedResult } = await token.allowance({ from_account: owner, for_account: forAccount });
  const current = decodedResult ?? 0n;
  if (current >= needed) return;
  if (decodedResult == null) {
    await token.create_allowance(forAccount, needed);
  } else {
    await token.change_allowance(forAccount, needed - current);
  }
}

export async function ensurePairAllowanceForRouter(
  sdk: any,
  pairAddress: string,
  owner: string,
  needed: bigint,
  routerAddress: string,
): Promise<void> {
  const pair = await initializeContractTyped<PairContractApi>(sdk, {
    aci: ACI.Pair,
    address: pairAddress,
  });
  const forAccount = routerAddress.replace('ct_', 'ak_');
  const { decodedResult } = await pair.allowance({ from_account: owner, for_account: forAccount });
  const current = decodedResult ?? 0n;
  if (current >= needed) return;
  if (decodedResult == null) {
    await pair.create_allowance(forAccount, needed);
  } else {
    await pair.change_allowance(forAccount, needed - current);
  }
}

export function formatTokenAmount(rawAmount: string | bigint, decimals: number): number {
  return new BigNumber(rawAmount.toString()).shiftedBy(-decimals).toNumber();
}

export function estimateRemovalMinimums(
  reserveA: bigint,
  reserveB: bigint,
  totalSupply: bigint,
  lpToBurn: bigint,
  slippagePct: number,
): { minA: bigint; minB: bigint } {
  if (totalSupply <= 0n || lpToBurn <= 0n) return { minA: 0n, minB: 0n };
  const amountAExp = (lpToBurn * reserveA) / totalSupply;
  const amountBExp = (lpToBurn * reserveB) / totalSupply;
  return {
    minA: subSlippage(amountAExp, slippagePct),
    minB: subSlippage(amountBExp, slippagePct),
  };
}
