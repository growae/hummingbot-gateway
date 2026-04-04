import { AeSdk, Node, Contract, type ContractMethodsBase, Encoded, MemoryAccount } from '@aeternity/aepp-sdk';
import axios from 'axios';
import crypto from 'crypto';
import fse from 'fs-extra';

import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { walletPath } from '../../wallet/utils';

import { getAeternityNetworkConfig, getAeternityChainConfig } from './aeternity.config';

// @ts-ignore
import Aex9Aci from 'dex-contracts-v2/deployment/aci/FungibleTokenFull.aci.json';

export interface AeternityTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export class Aeternity {
  private static _instances: { [name: string]: Aeternity } = {};

  public sdk: AeSdk;
  public network: string;
  public nodeUrl: string;
  public nativeTokenSymbol: string;
  public nativeTokenDecimals: number;
  public swapProvider: string;
  private _initialized: boolean = false;

  private constructor(network: string) {
    const config = getAeternityNetworkConfig(network);
    this.network = network;
    this.nodeUrl = config.nodeURL;
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this.nativeTokenDecimals = config.nativeCurrencyDecimals;
    this.swapProvider = config.swapProvider || '';

    const node = new Node(this.nodeUrl);
    this.sdk = new AeSdk({ nodes: [{ name: network, instance: node }] });
  }

  public static async getInstance(network: string): Promise<Aeternity> {
    if (!Aeternity._instances[network]) {
      const instance = new Aeternity(network);
      await instance.init();
      Aeternity._instances[network] = instance;
    }
    return Aeternity._instances[network];
  }

  public async init(): Promise<void> {
    this._initialized = true;
  }

  public ready(): boolean {
    return this._initialized;
  }

  public static validateAddress(address: string): string {
    if (!address.startsWith('ak_') || address.length < 35) {
      throw new Error(`Invalid Aeternity address format: ${address}`);
    }
    return address;
  }

  public async getWallet(address: string): Promise<MemoryAccount> {
    const validatedAddress = Aeternity.validateAddress(address);
    const path = `${walletPath}/aeternity`;
    const encryptedData = await fse.readFile(`${path}/${validatedAddress}.json`, 'utf8');

    const walletKey = ConfigManagerCertPassphrase.readWalletKey();
    if (!walletKey) {
      throw new Error('Missing wallet encryption key');
    }

    const secretKey = await this.decrypt(encryptedData, walletKey);
    return new MemoryAccount(secretKey as Encoded.AccountSecretKey);
  }

  public getSdkWithAccount(account: MemoryAccount): AeSdk {
    const node = new Node(this.nodeUrl);
    return new AeSdk({
      nodes: [{ name: this.network, instance: node }],
      accounts: [account],
    });
  }

  public async encrypt(secretKey: string, password: string): Promise<string> {
    const data = { secretKey, timestamp: Date.now() };
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, new Uint8Array(salt), 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', new Uint8Array(key) as any, new Uint8Array(iv) as any);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag,
      encrypted,
    });
  }

  public async decrypt(encryptedJson: string, password: string): Promise<string> {
    const parsed = JSON.parse(encryptedJson);
    const salt = Buffer.from(parsed.salt, 'hex');
    const iv = Buffer.from(parsed.iv, 'hex');
    const authTag = Buffer.from(parsed.authTag, 'hex');
    const key = crypto.scryptSync(password, new Uint8Array(salt), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', new Uint8Array(key) as any, new Uint8Array(iv) as any);
    decipher.setAuthTag(new Uint8Array(authTag) as any);
    let decrypted = decipher.update(parsed.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const data = JSON.parse(decrypted);
    return data.secretKey;
  }

  public async getBalance(address: string): Promise<bigint> {
    const balance = await this.sdk.getBalance(address as Encoded.AccountAddress);
    return BigInt(balance);
  }

  public async getTokenBalance(tokenAddress: string, owner: string): Promise<bigint> {
    try {
      const token = await Contract.initialize<ContractMethodsBase>({
        ...this.sdk.getContext(),
        aci: Aex9Aci,
        address: tokenAddress,
      } as any);
      const { decodedResult } = await (token as any).balance(owner);
      return BigInt(decodedResult ?? 0);
    } catch (error: any) {
      logger.warn(`Failed to get token balance for ${tokenAddress}: ${error.message}`);
      return 0n;
    }
  }

  public async getToken(addressOrSymbol: string): Promise<AeternityTokenInfo | undefined> {
    if (addressOrSymbol === 'AE' || addressOrSymbol === this.nativeTokenSymbol) {
      return {
        address: 'AE',
        name: 'Aeternity',
        symbol: 'AE',
        decimals: this.nativeTokenDecimals,
      };
    }
    if (addressOrSymbol.startsWith('ct_')) {
      return this.getTokenInfo(addressOrSymbol);
    }
    return undefined;
  }

  public async getTokenInfo(tokenAddress: string): Promise<AeternityTokenInfo | undefined> {
    try {
      const token = await Contract.initialize<ContractMethodsBase>({
        ...this.sdk.getContext(),
        aci: Aex9Aci,
        address: tokenAddress,
      } as any);
      const { decodedResult } = await (token as any).meta_info();
      return {
        address: tokenAddress,
        name: decodedResult.name || '',
        symbol: decodedResult.symbol || '',
        decimals: Number(decodedResult.decimals ?? 18),
      };
    } catch (error: any) {
      logger.warn(`Failed to get token info for ${tokenAddress}: ${error.message}`);
      return undefined;
    }
  }

  public async getBalances(address: string, tokens?: string[]): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};

    const nativeBalance = await this.getBalance(address);
    balances[this.nativeTokenSymbol] = Number(nativeBalance) / Math.pow(10, this.nativeTokenDecimals);

    if (tokens && tokens.length > 0) {
      for (const tokenAddr of tokens) {
        if (tokenAddr === this.nativeTokenSymbol || tokenAddr === 'AE') continue;
        try {
          const balance = await this.getTokenBalance(tokenAddr, address);
          const info = await this.getTokenInfo(tokenAddr);
          const decimals = info?.decimals ?? 18;
          const symbol = info?.symbol ?? tokenAddr;
          balances[symbol] = Number(balance) / Math.pow(10, decimals);
        } catch (err: any) {
          logger.warn(`Error getting balance for ${tokenAddr}: ${err.message}`);
          balances[tokenAddr] = 0;
        }
      }
    } else {
      // Auto-discover all AEX-9 token balances via middleware
      try {
        const mdwUrl = `${this.nodeUrl.replace(/\/$/, '')}/mdw/v3/accounts/${address}/aex9/balances`;
        logger.info(`Fetching AEX-9 balances from middleware: ${mdwUrl}`);
        const { data } = await axios.get(mdwUrl, { timeout: 10000 });

        if (data?.data && Array.isArray(data.data)) {
          for (const entry of data.data) {
            const symbol = entry.token_symbol || entry.contract_id;
            const decimals = typeof entry.decimals === 'number' ? entry.decimals : 18;
            const amount = Number(entry.amount ?? 0) / Math.pow(10, decimals);
            if (amount > 0) {
              balances[symbol] = amount;
            }
          }
          logger.info(`Found ${data.data.length} AEX-9 token(s) for ${address}`);
        }
      } catch (err: any) {
        logger.warn(`Middleware AEX-9 balance lookup failed: ${err.message}`);
      }
    }

    return balances;
  }

  public async getCurrentHeight(): Promise<number> {
    const height = await this.sdk.getHeight();
    return height;
  }

  public async getTransaction(txHash: string): Promise<any> {
    try {
      return await this.sdk.api.getTransactionByHash(txHash);
    } catch {
      return null;
    }
  }

  public static async getFirstWalletAddress(): Promise<string | null> {
    const path = `${walletPath}/aeternity`;
    try {
      await fse.ensureDir(path);
      const files = await fse.readdir(path);
      const walletFiles = files.filter((f: string) => f.endsWith('.json'));
      if (walletFiles.length === 0) return null;
      const addr = walletFiles[0].slice(0, -5);
      return addr.startsWith('ak_') ? addr : null;
    } catch {
      return null;
    }
  }

  public static async getWalletAddressExample(): Promise<string> {
    const chainConfig = getAeternityChainConfig();
    return chainConfig.defaultWallet;
  }

  public async close(): Promise<void> {
    if (this.network in Aeternity._instances) {
      delete Aeternity._instances[this.network];
    }
  }
}
