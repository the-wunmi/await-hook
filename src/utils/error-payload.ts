interface ErrorPayload {
  __error: string;
  __stack?: string;
}

export function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    '__error' in payload &&
    typeof (payload as ErrorPayload).__error === 'string'
  );
}

export function createErrorPayload(error: Error | string): ErrorPayload {
  if (typeof error === 'string') {
    return { __error: error };
  }
  return {
    __error: error.message,
    __stack: error.stack,
  };
}

export function extractError(payload: ErrorPayload): Error {
  const error = new Error(payload.__error);
  if (payload.__stack) {
    error.stack = payload.__stack;
  }
  return error;
}

