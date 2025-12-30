import { RedisBlockingStorage } from '../src/storage/redis-blpop';
import { HookTimeoutError, HookCancelledError } from '../src/errors';

describe('RedisBlockingStorage', () => {
  const createMockClient = (overrides: Partial<any> = {}) => ({
    blPop: jest.fn(),
    lPush: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    destroy: jest.fn(),
    ...overrides,
  });

  describe('wait', () => {
    it('resolves with payload from blPop', async () => {
      const mockClient = createMockClient({
        blPop: jest.fn().mockResolvedValue({
          key: 'hook:token',
          element: JSON.stringify({ status: 'done' }),
        }),
      });

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
      });

      const result = await storage.wait('token', 5000);
      expect(result).toEqual({ status: 'done' });
      expect(mockClient.blPop).toHaveBeenCalledWith('hook:token', 5);
    });

    it('throws HookTimeoutError when blPop returns null', async () => {
      const mockClient = createMockClient({
        blPop: jest.fn().mockResolvedValue(null),
      });

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
      });

      await expect(storage.wait('token', 5000)).rejects.toThrow(HookTimeoutError);
    });

    it('uses custom key prefix', async () => {
      const mockClient = createMockClient({
        blPop: jest.fn().mockResolvedValue({
          key: 'custom:token',
          element: JSON.stringify('result'),
        }),
      });

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
        keyPrefix: 'custom:',
      });

      await storage.wait('token', 5000);
      expect(mockClient.blPop).toHaveBeenCalledWith('custom:token', 5);
    });

    it('calls releaseClient after success', async () => {
      const mockClient = createMockClient({
        blPop: jest.fn().mockResolvedValue({
          key: 'hook:token',
          element: JSON.stringify('result'),
        }),
      });
      const releaseClient = jest.fn();

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
        releaseClient,
      });

      await storage.wait('token', 5000);
      expect(releaseClient).toHaveBeenCalledWith(mockClient);
    });

    it('calls releaseClient after failure', async () => {
      const mockClient = createMockClient({
        blPop: jest.fn().mockResolvedValue(null),
      });
      const releaseClient = jest.fn();

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
        releaseClient,
      });

      await storage.wait('token', 5000).catch(() => {});
      expect(releaseClient).toHaveBeenCalledWith(mockClient);
    });

    it('handles error payloads', async () => {
      const mockClient = createMockClient({
        blPop: jest.fn().mockResolvedValue({
          key: 'hook:token',
          element: JSON.stringify({ __error: 'Something failed' }),
        }),
      });

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
      });

      await expect(storage.wait('token', 5000)).rejects.toThrow('Something failed');
    });
  });

  describe('notify', () => {
    it('pushes payload to Redis list', async () => {
      const mockClient = createMockClient();

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
      });

      await storage.notify('token', { status: 'done' });

      expect(mockClient.lPush).toHaveBeenCalledWith(
        'hook:token',
        JSON.stringify({ status: 'done' })
      );
      expect(mockClient.expire).toHaveBeenCalledWith('hook:token', 5);
    });

    it('calls releaseClient after notify', async () => {
      const mockClient = createMockClient();
      const releaseClient = jest.fn();

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
        releaseClient,
      });

      await storage.notify('token', 'payload');
      expect(releaseClient).toHaveBeenCalledWith(mockClient);
    });
  });

  describe('cancel', () => {
    it('pushes cancellation error payload', async () => {
      const mockClient = createMockClient();

      const storage = new RedisBlockingStorage({
        getClient: () => mockClient,
      });

      await storage.cancel('token');

      expect(mockClient.lPush).toHaveBeenCalled();
      const payload = JSON.parse(mockClient.lPush.mock.calls[0][1]);
      expect(payload.__error).toBe('Hook cancelled');
    });
  });
});

