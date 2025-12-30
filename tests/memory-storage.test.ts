import { MemoryStorage } from '../src/storage/memory';
import { HookTimeoutError, HookNotFoundError, HookCancelledError } from '../src/errors';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    jest.useFakeTimers();
    storage = new MemoryStorage({ cleanupIntervalMs: 100 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('wait', () => {
    it('creates a pending promise', async () => {
      const promise = storage.wait('token', 5000);
      expect(promise).toBeInstanceOf(Promise);
      await storage.cancel('token');
      await promise.catch(() => {});
    });
  });

  describe('notify', () => {
    it('resolves waiting promise with payload', async () => {
      const promise = storage.wait('token', 5000);
      await storage.notify('token', { data: 'result' });
      const result = await promise;
      expect(result).toEqual({ data: 'result' });
    });

    it('throws HookNotFoundError for unknown token', async () => {
      await expect(storage.notify('unknown', {})).rejects.toThrow(HookNotFoundError);
    });

    it('removes hook after notify', async () => {
      storage.wait('token', 5000);
      await storage.notify('token', 'result');
      await expect(storage.notify('token', 'again')).rejects.toThrow(HookNotFoundError);
    });
  });

  describe('cancel', () => {
    it('rejects promise with HookCancelledError', async () => {
      const promise = storage.wait('token', 5000);
      await storage.cancel('token');
      await expect(promise).rejects.toThrow(HookCancelledError);
    });

    it('does nothing for unknown token', async () => {
      await expect(storage.cancel('unknown')).resolves.not.toThrow();
    });
  });

  describe('timeout', () => {
    it('rejects after timeout', async () => {
      const promise = storage.wait('token', 1000);
      jest.advanceTimersByTime(1100);
      await expect(promise).rejects.toThrow(HookTimeoutError);
    });

    it('does not reject before timeout', async () => {
      const promise = storage.wait('token', 5000);
      jest.advanceTimersByTime(1000);

      await storage.notify('token', 'result');
      expect(await promise).toBe('result');
    });
  });

  describe('cleanup', () => {
    it('cleanup method triggers expiration check', async () => {
      storage.wait('token', 5000);
      await storage.cleanup();
      await storage.notify('token', 'result');
    });
  });

  describe('close', () => {
    it('rejects all pending hooks', async () => {
      const promise1 = storage.wait('token1', 5000);
      const promise2 = storage.wait('token2', 5000);

      await storage.close();

      await expect(promise1).rejects.toThrow('Storage closed');
      await expect(promise2).rejects.toThrow('Storage closed');
    });
  });

  describe('concurrent operations', () => {
    it('handles multiple hooks independently', async () => {
      const p1 = storage.wait('t1', 5000);
      const p2 = storage.wait('t2', 5000);
      const p3 = storage.wait('t3', 5000);

      await storage.notify('t2', 'r2');
      await storage.notify('t1', 'r1');
      await storage.notify('t3', 'r3');

      expect(await p1).toBe('r1');
      expect(await p2).toBe('r2');
      expect(await p3).toBe('r3');
    });
  });
});
