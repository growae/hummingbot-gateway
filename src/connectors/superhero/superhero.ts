import { AeSdk, MemoryAccount } from '@aeternity/aepp-sdk';

import { Aeternity, AeternityTokenInfo } from '../../chains/aeternity/aeternity';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';

import {
  ACI,
  DexContracts,
  FactoryContractApi,
  PairContractApi,
  RouterContractApi,
  getSuperheroFactoryAddress,
  getSuperheroRouterAddress,
  getSuperheroWaeAddress,
  initializeContractTyped,
} from './superhero.contracts';

export class Superhero {
  private static _instances: { [network: string]: Superhero } = {};

  public network: string;
  public routerAddress: string;
  public factoryAddress: string;
  public waeAddress: string;
  private _aeternity: Aeternity;
  private _contracts: DexContracts | null = null;

  private constructor(network: string, aeternity: Aeternity) {
    this.network = network;
    this._aeternity = aeternity;
    this.routerAddress = getSuperheroRouterAddress(network);
    this.factoryAddress = getSuperheroFactoryAddress(network);
    this.waeAddress = getSuperheroWaeAddress(network);
  }

  public static async getInstance(network: string): Promise<Superhero> {
    if (!Superhero._instances[network]) {
      const aeternity = await Aeternity.getInstance(network);
      const instance = new Superhero(network, aeternity);
      await instance.init();
      Superhero._instances[network] = instance;
    }
    return Superhero._instances[network];
  }

  public get aeternity(): Aeternity {
    return this._aeternity;
  }

  public async init(): Promise<void> {
    await this.getContracts();
    logger.info(`📡 Aeternity Superhero DEX connector initialized on ${this.network}`);
  }

  public async getContracts(sdk?: AeSdk): Promise<DexContracts> {
    if (this._contracts && !sdk) return this._contracts;

    const sdkToUse = sdk || this._aeternity.sdk;
    const router = await initializeContractTyped<RouterContractApi>(sdkToUse, {
      aci: ACI.Router,
      address: this.routerAddress,
    });
    const factory = await initializeContractTyped<FactoryContractApi>(sdkToUse, {
      aci: ACI.Factory,
      address: this.factoryAddress,
    });

    const contracts: DexContracts = { router, factory };
    if (!sdk) this._contracts = contracts;
    return contracts;
  }

  public async getContractsWithAccount(account: MemoryAccount): Promise<DexContracts> {
    const sdk = this._aeternity.getSdkWithAccount(account);
    return this.getContracts(sdk);
  }

  public async getToken(symbolOrAddress: string): Promise<AeternityTokenInfo | undefined> {
    if (symbolOrAddress === 'AE' || symbolOrAddress === this._aeternity.nativeTokenSymbol) {
      return {
        address: 'AE',
        name: 'Aeternity',
        symbol: 'AE',
        decimals: 18,
      };
    }

    if (symbolOrAddress === 'WAE' || symbolOrAddress === this.waeAddress) {
      return {
        address: this.waeAddress,
        name: 'Wrapped Aeternity',
        symbol: 'WAE',
        decimals: 18,
      };
    }

    if (symbolOrAddress.startsWith('ct_')) {
      return this._aeternity.getTokenInfo(symbolOrAddress);
    }

    // Look up by symbol in the saved token list
    try {
      const saved = await TokenService.getInstance().getToken('aeternity', this.network, symbolOrAddress);
      if (saved) {
        this.cacheTokenAddress(saved.symbol, saved.address);
        return {
          address: saved.address,
          name: saved.name,
          symbol: saved.symbol,
          decimals: saved.decimals,
        };
      }
    } catch (e: any) {
      logger.warn(`Token list lookup failed for ${symbolOrAddress}: ${e.message}`);
    }

    return undefined;
  }

  public async getPool(
    tokenA: string,
    tokenB: string,
    sdk?: AeSdk,
  ): Promise<{
    pairAddress: string;
    token0: string;
    reserve0: bigint;
    reserve1: bigint;
    totalSupply: bigint;
  } | null> {
    const { factory } = sdk ? await this.getContracts(sdk) : await this.getContracts();

    const { decodedResult: pairOpt } = await factory.get_pair(tokenA, tokenB);
    if (!pairOpt) return null;

    const pairAddress = pairOpt as string;
    const sdkToUse = sdk || this._aeternity.sdk;
    const pair = await initializeContractTyped<PairContractApi>(sdkToUse, {
      aci: ACI.Pair,
      address: pairAddress,
    });

    const { decodedResult: token0 } = await pair.token0();
    const { decodedResult: reserves } = await pair.get_reserves();
    let totalSupply = 0n;
    try {
      const { decodedResult: supply } = await pair.total_supply();
      totalSupply = BigInt(supply);
    } catch {
      // total_supply may not be available
    }

    return {
      pairAddress,
      token0,
      reserve0: BigInt(reserves.reserve0),
      reserve1: BigInt(reserves.reserve1),
      totalSupply,
    };
  }

  public async getPoolInfoByAddress(poolAddress: string): Promise<{
    baseTokenAddress: string;
    quoteTokenAddress: string;
    feePct: number;
  } | null> {
    try {
      const sdk = this._aeternity.sdk;
      const pair = await initializeContractTyped<PairContractApi>(sdk, {
        aci: ACI.Pair,
        address: poolAddress,
      });

      const [{ decodedResult: token0 }, { decodedResult: token1 }] = await Promise.all([
        pair.token0(),
        pair.token1(),
      ]);

      return {
        baseTokenAddress: token0,
        quoteTokenAddress: token1,
        feePct: 0.3,
      };
    } catch (e: any) {
      logger.error(`Error fetching pool info for ${poolAddress}: ${e.message}`);
      return null;
    }
  }

  private _tokenAddressCache: Record<string, string> = {};

  public resolveTokenAddress(symbolOrAddress: string): string {
    if (symbolOrAddress === 'AE') return this.waeAddress;
    if (symbolOrAddress === 'WAE') return this.waeAddress;
    if (symbolOrAddress.startsWith('ct_')) return symbolOrAddress;
    return this._tokenAddressCache[symbolOrAddress] || symbolOrAddress;
  }

  public cacheTokenAddress(symbol: string, address: string): void {
    this._tokenAddressCache[symbol] = address;
  }

  public isNativeAe(symbolOrAddress: string): boolean {
    return symbolOrAddress === 'AE' || symbolOrAddress === this._aeternity.nativeTokenSymbol;
  }

  public async getFirstWalletAddress(): Promise<string | null> {
    return Aeternity.getFirstWalletAddress();
  }
}
