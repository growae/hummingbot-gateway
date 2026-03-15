import { Contract, type ContractMethodsBase, Encoded } from '@aeternity/aepp-sdk';

// @ts-ignore
import RouterAci from 'dex-contracts-v2/deployment/aci/AedexV2Router.aci.json';
// @ts-ignore
import FactoryAci from 'dex-contracts-v2/deployment/aci/AedexV2Factory.aci.json';
// @ts-ignore
import PairAci from 'dex-contracts-v2/deployment/aci/AedexV2Pair.aci.json';
// @ts-ignore
import Aex9Aci from 'dex-contracts-v2/deployment/aci/FungibleTokenFull.aci.json';

export const DEX_ADDRESSES: Record<string, {
  factory: string;
  router: string;
  wae: string;
}> = {
  mainnet: {
    factory: 'ct_2mfj3FoZxnhkSw5RZMcP8BfPoB1QR4QiYGNCdkAvLZ1zfF6paW',
    router: 'ct_azbNZ1XrPjXfqBqbAh1ffLNTQ1sbnuUDFvJrXjYz7JQA1saQ3',
    wae: 'ct_J3zBY8xxjsRr3QojETNw48Eb38fjvEuJKkQ6KzECvubvEcvCa',
  },
};

export const ACI = {
  Router: RouterAci,
  Factory: FactoryAci,
  Pair: PairAci,
  AEX9: Aex9Aci,
};

export const MINIMUM_LIQUIDITY = 1000n;

type InitializedContract = Awaited<ReturnType<typeof Contract.initialize>>;
type ContractCallResult<T> = Promise<{ decodedResult: T }>;
type ContractTxResult = Promise<{
  hash?: string;
  tx?: { hash?: string };
  transactionHash?: string;
}>;

export interface RouterContractApi extends ContractMethodsBase {
  factory: () => ContractCallResult<string | { $options?: { address?: string } }>;
  get_amounts_out: (amountIn: bigint, path: string[]) => ContractCallResult<(bigint | string)[]>;
  get_amounts_in: (amountOut: bigint, path: string[]) => ContractCallResult<(bigint | string)[]>;
  swap_exact_tokens_for_tokens: (
    amountIn: bigint, amountOutMin: bigint, path: string[],
    to: string, deadline: bigint, referrer: string | null,
  ) => ContractTxResult;
  swap_tokens_for_exact_tokens: (
    amountOut: bigint, amountInMax: bigint, path: string[],
    to: string, deadline: bigint, referrer: string | null,
  ) => ContractTxResult;
  swap_exact_ae_for_tokens: (
    amountOutMin: bigint, path: string[], to: string,
    deadline: bigint, referrer: string | null,
    options: { amount: bigint | string; [key: string]: unknown },
  ) => ContractTxResult;
  swap_ae_for_exact_tokens: (
    amountOut: bigint, path: string[], to: string,
    deadline: bigint, referrer: string | null,
    options: { amount: bigint | string; [key: string]: unknown },
  ) => ContractTxResult;
  swap_exact_tokens_for_ae: (
    amountIn: bigint, amountOutMin: bigint, path: string[],
    to: string, deadline: bigint, referrer: string | null,
  ) => ContractTxResult;
  swap_tokens_for_exact_ae: (
    amountOut: bigint, amountInMax: bigint, path: string[],
    to: string, deadline: bigint, referrer: string | null,
  ) => ContractTxResult;
  add_liquidity: (
    tokenA: string, tokenB: string,
    amountADesired: bigint, amountBDesired: bigint,
    amountAMin: bigint, amountBMin: bigint,
    to: string, minLiquidity: bigint, deadline: bigint,
    options?: unknown,
  ) => ContractTxResult;
  add_liquidity_ae: (
    token: string, amountTokenDesired: bigint,
    amountTokenMin: bigint, amountAeMin: bigint,
    to: string, minLiquidity: bigint, deadline: bigint,
    options: { amount: string; [key: string]: unknown },
  ) => ContractTxResult;
  remove_liquidity: (
    tokenA: string, tokenB: string, liquidity: bigint,
    amountAMin: bigint, amountBMin: bigint,
    to: string, deadline: bigint, options?: unknown,
  ) => ContractTxResult;
  remove_liquidity_ae: (
    token: string, liquidity: bigint,
    amountTokenMin: bigint, amountAeMin: bigint,
    to: string, deadline: bigint, options?: unknown,
  ) => ContractTxResult;
}

export interface FactoryContractApi extends ContractMethodsBase {
  get_pair: (tokenA: string, tokenB: string) => ContractCallResult<string | null | undefined>;
}

export interface Aex9ContractApi extends ContractMethodsBase {
  allowance: (params: { from_account: string; for_account: string }) => ContractCallResult<bigint | null | undefined>;
  create_allowance: (forAccount: string, value: bigint) => ContractTxResult;
  change_allowance: (forAccount: string, value: bigint) => ContractTxResult;
  balance: (owner: string) => ContractCallResult<bigint | string | null | undefined>;
  meta_info: () => ContractCallResult<{ symbol?: string; name?: string; decimals?: number | string }>;
}

export interface PairContractApi extends ContractMethodsBase {
  token0: () => ContractCallResult<string>;
  token1: () => ContractCallResult<string>;
  get_reserves: () => ContractCallResult<{ reserve0: bigint | string; reserve1: bigint | string }>;
  allowance: (params: { from_account: string; for_account: string }) => ContractCallResult<bigint | null | undefined>;
  create_allowance: (forAccount: string, value: bigint) => ContractTxResult;
  change_allowance: (forAccount: string, value: bigint) => ContractTxResult;
  total_supply: () => ContractCallResult<bigint | string>;
  balance: (owner: string) => ContractCallResult<bigint | string | null | undefined>;
}

export type RouterContract = InitializedContract & RouterContractApi;
export type FactoryContract = InitializedContract & FactoryContractApi;
export type Aex9Contract = InitializedContract & Aex9ContractApi;
export type PairContract = InitializedContract & PairContractApi;

export type DexContracts = {
  router: RouterContract;
  factory: FactoryContract;
};

export function getSuperheroRouterAddress(network: string): string {
  const addrs = DEX_ADDRESSES[network];
  if (!addrs) throw new Error(`No DEX addresses configured for network: ${network}`);
  return addrs.router;
}

export function getSuperheroFactoryAddress(network: string): string {
  const addrs = DEX_ADDRESSES[network];
  if (!addrs) throw new Error(`No DEX addresses configured for network: ${network}`);
  return addrs.factory;
}

export function getSuperheroWaeAddress(network: string): string {
  const addrs = DEX_ADDRESSES[network];
  if (!addrs) throw new Error(`No DEX addresses configured for network: ${network}`);
  return addrs.wae;
}

export async function initializeContractTyped<M extends ContractMethodsBase>(
  sdk: any,
  options: { aci: unknown; address: string },
): Promise<InitializedContract & M> {
  const ctx = typeof sdk.getContext === 'function' ? sdk.getContext() : {};
  return Contract.initialize({
    ...ctx,
    ...options,
  } as any) as Promise<InitializedContract & M>;
}
