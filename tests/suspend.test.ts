import {
  suspend,
  resume,
  reject,
  setDefaultStorage,
  setDefaultTimeout,
  getDefaultStorage,
  getDefaultTimeout,
  MemoryStorage,
  HookTimeoutError,
  HookCancelledError,
  generateToken,
} from '../src';

describe('suspend', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage({ cleanupIntervalMs: 100 });
    setDefaultStorage(storage);
    setDefaultTimeout(30000);
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('hook creation', () => {
    it('creates a hook with auto-generated token', async () => {
      const hook = suspend();
      expect(hook.token).toMatch(/^hook_/);
      expect(hook.timeoutMs).toBe(30000);
      expect(hook.createdAt).toBeLessThanOrEqual(Date.now());
      await hook.cancel?.();
      await expect(hook).rejects.toThrow(HookCancelledError);
    });

    it('creates a hook with custom token', async () => {
      const hook = suspend({ token: 'custom-token' });
      expect(hook.token).toBe('custom-token');
      await hook.cancel?.();
      await expect(hook).rejects.toThrow(HookCancelledError);
    });

    it('creates a hook with custom timeout', async () => {
      const hook = suspend({ timeoutMs: 5000 });
      expect(hook.timeoutMs).toBe(5000);
      await hook.cancel?.();
      await expect(hook).rejects.toThrow(HookCancelledError);
    });

    it('creates a hook with custom storage', async () => {
      const customStorage = new MemoryStorage();
      const hook = suspend({ storage: customStorage, token: 'test' });
      expect(hook.token).toBe('test');
      await hook.cancel?.();
      await expect(hook).rejects.toThrow(HookCancelledError);
      await customStorage.close();
    });

    it('hook is a promise', async () => {
      const hook = suspend();
      expect(hook).toBeInstanceOf(Promise);
      await hook.cancel?.();
      await expect(hook).rejects.toThrow(HookCancelledError);
    });
  });

  describe('resume', () => {
    it('resolves hook with payload', async () => {
      const hook = suspend<{ status: string }>({ token: 'test-123' });

      setImmediate(() => {
        resume('test-123', { status: 'done' });
      });

      const result = await hook;
      expect(result).toEqual({ status: 'done' });
    });

    it('resolves with different payload types', async () => {
      const hook1 = suspend<string>({ token: 'string-test' });
      const hook2 = suspend<number>({ token: 'number-test' });
      const hook3 = suspend<null>({ token: 'null-test' });

      setImmediate(() => {
        resume('string-test', 'hello');
        resume('number-test', 42);
        resume('null-test', null);
      });

      expect(await hook1).toBe('hello');
      expect(await hook2).toBe(42);
      expect(await hook3).toBe(null);
    });

    it('resolves with complex nested objects', async () => {
      const hook = suspend<{ user: { items: string[] } }>({ token: 'complex' });

      setImmediate(() => {
        resume('complex', { user: { items: ['a', 'b', 'c'] } });
      });

      const result = await hook;
      expect(result.user.items).toEqual(['a', 'b', 'c']);
    });
  });

  describe('reject', () => {
    it('rejects hook with error', async () => {
      const hook = suspend({ token: 'error-test' });

      setImmediate(() => {
        reject('error-test', new Error('Something failed'));
      });

      await expect(hook).rejects.toThrow('Something failed');
    });

    it('rejects hook with string error', async () => {
      const hook = suspend({ token: 'string-error' });

      setImmediate(() => {
        reject('string-error', 'String error message');
      });

      await expect(hook).rejects.toThrow('String error message');
    });
  });

  describe('cancel', () => {
    it('cancels a waiting hook', async () => {
      const hook = suspend({ token: 'cancel-test' });

      setImmediate(async () => {
        await hook.cancel?.();
      });

      await expect(hook).rejects.toThrow(HookCancelledError);
    });
  });

  describe('timeout', () => {
    it('times out after specified duration', async () => {
      jest.useFakeTimers();
      const hook = suspend({ token: 'timeout-test', timeoutMs: 1000 });

      jest.advanceTimersByTime(1100);

      await expect(hook).rejects.toThrow(HookTimeoutError);
      jest.useRealTimers();
    });
  });

  describe('multiple hooks', () => {
    it('handles multiple concurrent hooks', async () => {
      const hook1 = suspend<number>({ token: 'hook-1' });
      const hook2 = suspend<number>({ token: 'hook-2' });
      const hook3 = suspend<number>({ token: 'hook-3' });

      setImmediate(() => {
        resume('hook-2', 200);
        resume('hook-1', 100);
        resume('hook-3', 300);
      });

      const results = await Promise.all([hook1, hook2, hook3]);
      expect(results).toEqual([100, 200, 300]);
    });
  });
});

describe('config', () => {
  it('setDefaultTimeout updates default', () => {
    setDefaultTimeout(60000);
    expect(getDefaultTimeout()).toBe(60000);
  });

  it('setDefaultTimeout throws on invalid value', () => {
    expect(() => setDefaultTimeout(0)).toThrow();
    expect(() => setDefaultTimeout(-1)).toThrow();
  });

  it('setDefaultStorage updates default', async () => {
    const storage = new MemoryStorage();
    setDefaultStorage(storage);
    expect(getDefaultStorage()).toBe(storage);
    await storage.close();
  });
});

describe('generateToken', () => {
  it('generates unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(100);
  });

  it('tokens start with hook_', () => {
    const token = generateToken();
    expect(token).toMatch(/^hook_/);
  });
});
