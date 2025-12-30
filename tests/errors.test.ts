import {
  HookTimeoutError,
  HookNotFoundError,
  HookCancelledError,
} from '../src/errors';

describe('HookTimeoutError', () => {
  it('has correct name', () => {
    const error = new HookTimeoutError('timeout', 'token-123');
    expect(error.name).toBe('HookTimeoutError');
  });

  it('has correct message', () => {
    const error = new HookTimeoutError('Hook timed out', 'token-123');
    expect(error.message).toBe('Hook timed out');
  });

  it('has token property', () => {
    const error = new HookTimeoutError('timeout', 'token-123');
    expect(error.token).toBe('token-123');
  });

  it('is instance of Error', () => {
    const error = new HookTimeoutError('timeout', 'token-123');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('HookNotFoundError', () => {
  it('has correct name', () => {
    const error = new HookNotFoundError('not found', 'token-123');
    expect(error.name).toBe('HookNotFoundError');
  });

  it('has correct message', () => {
    const error = new HookNotFoundError('Hook not found', 'token-123');
    expect(error.message).toBe('Hook not found');
  });

  it('has token property', () => {
    const error = new HookNotFoundError('not found', 'token-123');
    expect(error.token).toBe('token-123');
  });

  it('is instance of Error', () => {
    const error = new HookNotFoundError('not found', 'token-123');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('HookCancelledError', () => {
  it('has correct name', () => {
    const error = new HookCancelledError('cancelled', 'token-123');
    expect(error.name).toBe('HookCancelledError');
  });

  it('has correct message', () => {
    const error = new HookCancelledError('Hook cancelled', 'token-123');
    expect(error.message).toBe('Hook cancelled');
  });

  it('has token property', () => {
    const error = new HookCancelledError('cancelled', 'token-123');
    expect(error.token).toBe('token-123');
  });

  it('is instance of Error', () => {
    const error = new HookCancelledError('cancelled', 'token-123');
    expect(error).toBeInstanceOf(Error);
  });
});

