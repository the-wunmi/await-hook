import { RedisPubSubStorage } from '../src/storage/redis-pubsub';
import { HookTimeoutError, HookCancelledError } from '../src/errors';

describe('RedisPubSubStorage', () => {
  let subscribeCallback: ((message: string) => void) | null = null;
  let storage: RedisPubSubStorage | null = null;

  const createMockSubscriber = () => ({
    subscribe: jest.fn().mockImplementation(async (_channel, callback) => {
      subscribeCallback = callback;
    }),
    publish: jest.fn().mockResolvedValue(1),
  });

  const createMockPublisher = () => ({
    subscribe: jest.fn(),
    publish: jest.fn().mockResolvedValue(1),
  });

  beforeEach(() => {
    subscribeCallback = null;
  });

  afterEach(async () => {
    if (storage) {
      await storage.close();
      storage = null;
    }
  });

  describe('initialization', () => {
    it('subscribes to channel on init', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        channel: 'test-channel',
        cleanupIntervalMs: 10000,
      });

      await storage.notify('token', 'test');

      expect(subscriber.subscribe).toHaveBeenCalledWith(
        'test-channel',
        expect.any(Function)
      );
    });
  });

  describe('wait', () => {
    it('throws when storage is closed', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.close();
      storage = null;

      const closedStorage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });
      await closedStorage.close();

      await expect(closedStorage.wait('token', 5000)).rejects.toThrow('Storage has been closed');
    });
  });

  describe('notify', () => {
    it('publishes message to channel', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        channel: 'test-channel',
        cleanupIntervalMs: 10000,
      });

      await storage.notify('token', { status: 'done' });

      expect(publisher.publish).toHaveBeenCalledWith(
        'test-channel',
        JSON.stringify({ token: 'token', payload: { status: 'done' } })
      );
    });

    it('throws when storage is closed', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.close();
      storage = null;

      const closedStorage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });
      await closedStorage.close();

      await expect(closedStorage.notify('token', 'payload')).rejects.toThrow('Storage has been closed');
    });
  });

  describe('message handling', () => {
    it('resolves hook when message received', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.notify('init', null);

      const promise = storage.wait<{ status: string }>('test-token', 5000);

      await Promise.resolve();

      subscribeCallback?.(JSON.stringify({
        token: 'test-token',
        payload: { status: 'done' },
      }));

      const result = await promise;
      expect(result).toEqual({ status: 'done' });
    });

    it('rejects hook when error payload received', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.notify('init', null);

      const promise = storage.wait('test-token', 5000);
      await Promise.resolve();

      subscribeCallback?.(JSON.stringify({
        token: 'test-token',
        payload: { __error: 'Something failed' },
      }));

      await expect(promise).rejects.toThrow('Something failed');
    });

    it('ignores messages for unknown tokens', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.notify('init', null);

      const promise = storage.wait('my-token', 5000);
      await Promise.resolve();

      subscribeCallback?.(JSON.stringify({
        token: 'other-token',
        payload: 'result',
      }));

      subscribeCallback?.(JSON.stringify({
        token: 'my-token',
        payload: 'correct',
      }));

      const result = await promise;
      expect(result).toBe('correct');
    });

    it('ignores malformed messages', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.notify('init', null);

      const promise = storage.wait('token', 5000);
      await Promise.resolve();

      subscribeCallback?.('not valid json');

      subscribeCallback?.(JSON.stringify({
        token: 'token',
        payload: 'valid',
      }));

      const result = await promise;
      expect(result).toBe('valid');
    });
  });

  describe('cancel', () => {
    it('rejects hook with HookCancelledError', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await storage.notify('init', null);

      const promise = storage.wait('token', 5000);
      await Promise.resolve();

      await storage.cancel('token');

      await expect(promise).rejects.toThrow(HookCancelledError);
    });
  });

  describe('timeout', () => {
    it('rejects after timeout via cleanup interval', async () => {
      jest.useFakeTimers();

      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 50,
      });

      // Manually trigger init to complete since we're using fake timers
      await storage.notify('init', null);

      let rejected = false;
      let rejectedError: Error | null = null;

      const promise = storage.wait('token', 100).catch((e) => {
        rejected = true;
        rejectedError = e;
      });

      await Promise.resolve();

      jest.advanceTimersByTime(150);

      await promise;

      expect(rejected).toBe(true);
      expect(rejectedError).toBeInstanceOf(HookTimeoutError);

      jest.useRealTimers();
    });
  });

  describe('close', () => {
    it('rejects all pending hooks', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
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
    });
  });

  describe('cleanup', () => {
    it('cleanup method exists and works', async () => {
      const subscriber = createMockSubscriber();
      const publisher = createMockPublisher();

      storage = new RedisPubSubStorage({
        getSubscriber: () => Promise.resolve(subscriber),
        getPublisher: () => Promise.resolve(publisher),
        cleanupIntervalMs: 10000,
      });

      await expect(storage.cleanup()).resolves.not.toThrow();
    });
  });
});
