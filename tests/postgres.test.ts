import { PostgresStorage } from '../src/storage/postgres';
import { HookTimeoutError, HookCancelledError } from '../src/errors';

describe('PostgresStorage', () => {
  let notificationCallback: ((msg: { channel: string; payload?: string }) => void) | null = null;
  let storage: PostgresStorage | null = null;

  const createMockClient = () => ({
    query: jest.fn().mockResolvedValue({}),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'notification') {
        notificationCallback = callback;
      }
    }),
    release: jest.fn(),
    escapeIdentifier: jest.fn((id: string) => `"${id}"`),
  });

  beforeEach(() => {
    notificationCallback = null;
  });

  afterEach(async () => {
    if (storage) {
      await storage.close();
      storage = null;
    }
  });

  it('listens on channel during init', async () => {
    const mockClient = createMockClient();
    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      channel: 'my_channel',
      cleanupIntervalMs: 10000,
    });

    await storage.notify('token', null);

    expect(mockClient.query).toHaveBeenCalledWith('LISTEN "my_channel"');
  });

  it('wait resolves when notification received', async () => {
    const mockClient = createMockClient();
    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      channel: 'hook_events',
      cleanupIntervalMs: 10000,
    });

    await storage.notify('init', null);
    const promise = storage.wait<{ status: string }>('token', 5000);
    await Promise.resolve();

    notificationCallback?.({
      channel: 'hook_events',
      payload: JSON.stringify({ token: 'token', payload: { status: 'done' } }),
    });

    expect(await promise).toEqual({ status: 'done' });
  });

  it('notify sends pg_notify', async () => {
    const mockClient = createMockClient();
    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      channel: 'hook_events',
      cleanupIntervalMs: 10000,
    });

    await storage.notify('token', { data: 'test' });

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_notify($1, $2)',
      ['hook_events', JSON.stringify({ token: 'token', payload: { data: 'test' } })]
    );
  });

  it('cancel rejects hook with HookCancelledError', async () => {
    const mockClient = createMockClient();
    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      cleanupIntervalMs: 10000,
    });

    await storage.notify('init', null);
    const promise = storage.wait('token', 5000);
    await Promise.resolve();

    await storage.cancel('token');

    await expect(promise).rejects.toThrow(HookCancelledError);
  });

  it('times out via cleanup interval', async () => {
    jest.useFakeTimers();
    const mockClient = createMockClient();

    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      cleanupIntervalMs: 50,
    });

    await storage.notify('init', null);
    const promise = storage.wait('token', 100).catch(e => e);
    await Promise.resolve();

    jest.advanceTimersByTime(150);

    expect(await promise).toBeInstanceOf(HookTimeoutError);
    jest.useRealTimers();
  });

  it('close rejects all pending hooks and unlistens', async () => {
    const mockClient = createMockClient();
    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      channel: 'hook_events',
      cleanupIntervalMs: 10000,
    });

    await storage.notify('init', null);
    const p1 = storage.wait('token1', 5000);
    const p2 = storage.wait('token2', 5000);
    await Promise.resolve();

    await storage.close();
    storage = null;

    await expect(p1).rejects.toThrow('Storage closed');
    await expect(p2).rejects.toThrow('Storage closed');
    expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN "hook_events"');
  });

  it('calls releaseClient on close', async () => {
    const mockClient = createMockClient();
    const releaseClient = jest.fn();

    storage = new PostgresStorage({
      getClient: () => Promise.resolve(mockClient),
      releaseClient,
      cleanupIntervalMs: 10000,
    });

    await storage.notify('init', null);
    await storage.close();
    storage = null;

    expect(releaseClient).toHaveBeenCalledWith(mockClient);
  });
});

