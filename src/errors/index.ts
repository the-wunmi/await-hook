export class HookTimeoutError extends Error {
  constructor(
    message: string,
    public readonly token: string
  ) {
    super(message);
    this.name = 'HookTimeoutError';
    Error.captureStackTrace?.(this, HookTimeoutError);
  }
}

export class HookNotFoundError extends Error {
  constructor(
    message: string,
    public readonly token: string
  ) {
    super(message);
    this.name = 'HookNotFoundError';
    Error.captureStackTrace?.(this, HookNotFoundError);
  }
}

export class HookCancelledError extends Error {
  constructor(
    message: string,
    public readonly token: string
  ) {
    super(message);
    this.name = 'HookCancelledError';
    Error.captureStackTrace?.(this, HookCancelledError);
  }
}

