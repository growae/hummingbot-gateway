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
jest.mock('../../../../src/connectors/superhero/superhero.contracts', () => ({
  ...jest.requireActual('../../../../src/connectors/superhero/superhero.contracts'),
  initializeContractTyped: jest.fn(),
}));
jest.mock('../../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const MOCK_POOL_ADDRESS = 'ct_pair3333333333333333333333333333333333333333';
const MOCK_TOKEN0 = 'ct_base111111111111111111111111111111111111111';
const MOCK_TOKEN1 = 'ct_J3zBY8xxjsRr3QojETNw48Eb38fjvEuJKkQ6KzECvubvEcvCa';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import(
    '../../../../src/connectors/superhero/amm-routes/poolInfo'
  );
  await server.register(poolInfoRoute);
  return server;
};

describe('GET /pool-info (Superhero)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return pool information', async () => {
    const { Superhero } = await import('../../../../src/connectors/superhero/superhero');
    const { initializeContractTyped } = await import('../../../../src/connectors/superhero/superhero.contracts');

    const mockPairContract = {
      token0: jest.fn().mockResolvedValue({ decodedResult: MOCK_TOKEN0 }),
      token1: jest.fn().mockResolvedValue({ decodedResult: MOCK_TOKEN1 }),
      get_reserves: jest.fn().mockResolvedValue({
        decodedResult: { reserve0: 5000000000000000000000n, reserve1: 10000000000000000000000n },
      }),
    };

    (initializeContractTyped as jest.Mock).mockResolvedValue(mockPairContract);

    const mockSuperhero = {
      aeternity: { sdk: {} },
      getToken: jest.fn()
        .mockResolvedValueOnce({ address: MOCK_TOKEN0, symbol: 'TBASE', decimals: 18 })
        .mockResolvedValueOnce({ address: MOCK_TOKEN1, symbol: 'WAE', decimals: 18 }),
    };
    (Superhero.getInstance as jest.Mock).mockResolvedValue(mockSuperhero);

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet',
        poolAddress: MOCK_POOL_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('address', MOCK_POOL_ADDRESS);
    expect(body).toHaveProperty('baseTokenAddress', MOCK_TOKEN0);
    expect(body).toHaveProperty('quoteTokenAddress', MOCK_TOKEN1);
    expect(body).toHaveProperty('feePct', 0.3);
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('baseTokenAmount');
    expect(body).toHaveProperty('quoteTokenAmount');
    expect(body.price).toBeCloseTo(2, 1);
  });

  it('should return 500 on contract error', async () => {
    const { Superhero } = await import('../../../../src/connectors/superhero/superhero');
    const { initializeContractTyped } = await import('../../../../src/connectors/superhero/superhero.contracts');

    (initializeContractTyped as jest.Mock).mockRejectedValue(new Error('Contract init failed'));

    const mockSuperhero = {
      aeternity: { sdk: {} },
    };
    (Superhero.getInstance as jest.Mock).mockResolvedValue(mockSuperhero);

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet',
        poolAddress: MOCK_POOL_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(500);
  });
});
