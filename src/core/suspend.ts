import type { Hook, SuspendOptions } from "./types";
import { generateToken } from "../utils/token";
import { getDefaultStorage, getDefaultTimeout } from "./config";

export function suspend<T = unknown>(options: SuspendOptions = {}): Hook<T> {
  const token = options.token ?? generateToken();
  const timeoutMs = options.timeoutMs ?? getDefaultTimeout();
  const storage = options.storage ?? getDefaultStorage();
  const createdAt = Date.now();

  const promise = storage.wait<T>(token, timeoutMs);

  const cancel = async () => {
    if (storage.cancel) {
      await storage.cancel(token);
    } else {
      throw new Error("Storage adapter does not support cancellation");
    }
  };

  const hook = promise as Hook<T>;
  hook.token = token;
  hook.timeoutMs = timeoutMs;
  hook.createdAt = createdAt;
  hook.cancel = cancel;

  return hook;
}
