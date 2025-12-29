import type { ResumeOptions } from './types';
import { getDefaultStorage } from './config';
import { createErrorPayload } from '../utils/error-payload';

export async function resume<T = unknown>(
  token: string,
  payload: T,
  options: ResumeOptions = {}
): Promise<void> {
  const storage = options.storage ?? getDefaultStorage();
  await storage.notify(token, payload);
}

export async function reject(
  token: string,
  error: Error | string,
  options: ResumeOptions = {}
): Promise<void> {
  const errorPayload = createErrorPayload(
    typeof error === 'string' ? new Error(error) : error
  );

  const storage = options.storage ?? getDefaultStorage();
  await storage.notify(token, errorPayload);
}

