import {
  isErrorPayload,
  createErrorPayload,
  extractError,
} from '../src/utils/error-payload';

describe('error-payload utils', () => {
  describe('isErrorPayload', () => {
    it('returns true for error payloads', () => {
      expect(isErrorPayload({ __error: 'message' })).toBe(true);
      expect(isErrorPayload({ __error: 'message', __stack: 'stack' })).toBe(true);
    });

    it('returns false for non-error payloads', () => {
      expect(isErrorPayload(null)).toBe(false);
      expect(isErrorPayload(undefined)).toBe(false);
      expect(isErrorPayload('string')).toBe(false);
      expect(isErrorPayload(123)).toBe(false);
      expect(isErrorPayload({})).toBe(false);
      expect(isErrorPayload({ error: 'message' })).toBe(false);
    });
  });

  describe('createErrorPayload', () => {
    it('creates payload from Error object', () => {
      const error = new Error('test error');
      const payload = createErrorPayload(error);
      expect(payload.__error).toBe('test error');
      expect(payload.__stack).toBeDefined();
    });

    it('creates payload from string', () => {
      const payload = createErrorPayload('string error');
      expect(payload.__error).toBe('string error');
      expect(payload.__stack).toBeUndefined();
    });
  });

  describe('extractError', () => {
    it('extracts error from payload', () => {
      const payload = { __error: 'extracted error' };
      const error = extractError(payload);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('extracted error');
    });

    it('preserves stack trace', () => {
      const payload = { __error: 'error', __stack: 'custom stack' };
      const error = extractError(payload);
      expect(error.stack).toBe('custom stack');
    });
  });
});

