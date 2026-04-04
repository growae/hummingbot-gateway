import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'superhero.slippagePct') return 1;
        return undefined;
      }),
    }),
  },
}));

jest.mock('../../../../src/connectors/superhero/superhero');
jest.mock('../../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const MOCK_BASE_TOKEN = {
  address: 'ct_base111111111111111111111111111111111111111',
  name: 'TestBase',
  symbol: 'TBASE',
  decimals: 18,
};

const MOCK_QUOTE_TOKEN = {
  address: 'ct_quote22222222222222222222222222222222222222',
  name: 'TestQuote',
  symbol: 'TQUOTE',
  decimals: 6,
};

const MOCK_POOL_ADDRESS = 'ct_pair3333333333333333333333333333333333333333';
const MOCK_WAE_ADDRESS = 'ct_J3zBY8xxjsRr3QojETNw48Eb38fjvEuJKkQ6KzECvubvEcvCa';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import(
    '../../../../src/connectors/superhero/amm-routes/quoteSwap'
  );
  await server.register(quoteSwapRoute);
  return server;
};

describe('GET /quote-swap (Superhero)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a SELL-side quote', async () => {
    const { Superhero } = await import('../../../../src/connectors/superhero/superhero');

    const rawAmountOut = 150_000_000n;

    const mockRouter = {
      get_amounts_out: jest.fn().mockResolvedValue({
        decodedResult: [1000000000000000000n, rawAmountOut],
      }),
    };

    const mockSuperhero = {
      network: 'mainnet',
      routerAddress: 'ct_router',
      waeAddress: MOCK_WAE_ADDRESS,
      getToken: jest.fn()
        .mockResolvedValueOnce(MOCK_BASE_TOKEN)
        .mockResolvedValueOnce(MOCK_QUOTE_TOKEN),
      resolveTokenAddress: jest.fn()
        .mockReturnValueOnce(MOCK_BASE_TOKEN.address)
        .mockReturnValueOnce(MOCK_QUOTE_TOKEN.address),
      getPool: jest.fn().mockResolvedValue({
        pairAddress: MOCK_POOL_ADDRESS,
        token0: MOCK_BASE_TOKEN.address,
        reserve0: 10000000000000000000000n,
        reserve1: 1500000000000n,
        totalSupply: 100000000000000000000n,
      }),
      getContracts: jest.fn().mockResolvedValue({ router: mockRouter }),
    };

    (Superhero.getInstance as jest.Mock).mockResolvedValue(mockSuperhero);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'TBASE',
        quoteToken: 'TQUOTE',
        amount: '1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', MOCK_POOL_ADDRESS);
    expect(body).toHaveProperty('amountIn', 1);
    expect(body).toHaveProperty('amountOut');
    expect(body.amountOut).toBeCloseTo(150, 0);
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn', 1);
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('priceImpactPct');
    expect(body).toHaveProperty('slippagePct', 1);
    expect(body).toHaveProperty('tokenIn', MOCK_BASE_TOKEN.address);
    expect(body).toHaveProperty('tokenOut', MOCK_QUOTE_TOKEN.address);
  });

  it('should return a BUY-side quote', async () => {
    const { Superhero } = await import('../../../../src/connectors/superhero/superhero');

    const rawAmountIn = 150_000_000n;

    const mockRouter = {
      get_amounts_in: jest.fn().mockResolvedValue({
        decodedResult: [rawAmountIn, 1000000000000000000n],
      }),
    };

    const mockSuperhero = {
      network: 'mainnet',
      routerAddress: 'ct_router',
      waeAddress: MOCK_WAE_ADDRESS,
      getToken: jest.fn()
        .mockResolvedValueOnce(MOCK_BASE_TOKEN)
        .mockResolvedValueOnce(MOCK_QUOTE_TOKEN),
      resolveTokenAddress: jest.fn()
        .mockReturnValueOnce(MOCK_BASE_TOKEN.address)
        .mockReturnValueOnce(MOCK_QUOTE_TOKEN.address),
      getPool: jest.fn().mockResolvedValue({
        pairAddress: MOCK_POOL_ADDRESS,
        token0: MOCK_BASE_TOKEN.address,
        reserve0: 10000000000000000000000n,
        reserve1: 1500000000000n,
        totalSupply: 100000000000000000000n,
      }),
      getContracts: jest.fn().mockResolvedValue({ router: mockRouter }),
    };

    (Superhero.getInstance as jest.Mock).mockResolvedValue(mockSuperhero);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'TBASE',
        quoteToken: 'TQUOTE',
        amount: '1',
        side: 'BUY',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', MOCK_POOL_ADDRESS);
    expect(body).toHaveProperty('amountOut', 1);
    expect(body).toHaveProperty('amountIn');
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('minAmountOut', 1);
    expect(body).toHaveProperty('tokenIn', MOCK_QUOTE_TOKEN.address);
    expect(body).toHaveProperty('tokenOut', MOCK_BASE_TOKEN.address);
  });

  it('should return 500 when base token is not found', async () => {
    const { Superhero } = await import('../../../../src/connectors/superhero/superhero');

    const mockSuperhero = {
      getToken: jest.fn().mockResolvedValue(undefined),
      resolveTokenAddress: jest.fn().mockReturnValue('ct_invalid'),
    };

    (Superhero.getInstance as jest.Mock).mockResolvedValue(mockSuperhero);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'INVALID',
        quoteToken: 'TQUOTE',
        amount: '1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
  });

  it('should return 500 when no pool is found', async () => {
    const { Superhero } = await import('../../../../src/connectors/superhero/superhero');

    const mockSuperhero = {
      getToken: jest.fn()
        .mockResolvedValueOnce(MOCK_BASE_TOKEN)
        .mockResolvedValueOnce(MOCK_QUOTE_TOKEN),
      resolveTokenAddress: jest.fn()
        .mockReturnValueOnce(MOCK_BASE_TOKEN.address)
        .mockReturnValueOnce(MOCK_QUOTE_TOKEN.address),
      getPool: jest.fn().mockResolvedValue(null),
    };

    (Superhero.getInstance as jest.Mock).mockResolvedValue(mockSuperhero);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'TBASE',
        quoteToken: 'TQUOTE',
        amount: '1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(500);
  });
});
