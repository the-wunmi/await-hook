# await-hook

Await async operations that complete via external events like webhooks or queue callbacks.

## Design

This package is **not durable by design**. Hooks exist only within the current execution context and do not survive process restarts or deployments.

It's meant for short-lived operations where you want to await an external event and return the result immediately, rather than responding with "pending" and requiring the client to poll.

You should still implement proper webhook/queue handling for durability. This package just lets you wait for the result when you need it.

## Installation

```bash
npm install await-hook
```

## Quick Start

```typescript
import { suspend, resume } from 'await-hook';

// Create a hook and wait for it
const hook = suspend<Result>({ token: 'my-operation', timeoutMs: 60000 });

// Somewhere else (webhook handler, queue consumer, etc.)
await resume('my-operation', { status: 'done' });

// Original code continues
const result = await hook;
```

## API

### `suspend<T>(options?): Hook<T>`

Creates a hook that resolves when `resume()` is called with the matching token.

**Options:**
- `token?: string` - Unique identifier (auto-generated if not provided)
- `timeoutMs?: number` - Timeout in milliseconds (default: 30000)
- `storage?: StorageAdapter` - Storage adapter to use

**Returns:** `Hook<T>` extending `Promise<T>` with:
- `token: string`
- `timeoutMs: number`
- `createdAt: number`
- `cancel(): Promise<void>`

### `resume<T>(token, payload, options?): Promise<void>`

Resolves a waiting hook with the given payload.

### `reject(token, error, options?): Promise<void>`

Rejects a waiting hook with an error.

### `setDefaultStorage(storage): void`

Sets the default storage adapter.

### `setDefaultTimeout(timeoutMs): void`

Sets the default timeout in milliseconds.

## Storage Adapters

The default memory storage only works within a single process. For production with multiple instances or when `suspend()` and `resume()` happen in different processes, use Redis.

### Memory (Default)

```typescript
import { MemoryStorage, setDefaultStorage } from 'await-hook';

setDefaultStorage(new MemoryStorage({
  cleanupIntervalMs: 1000,
}));
```

### Redis BLPOP

Uses blocking list operations. Each waiting hook requires its own connection.

With Redis v5+ pool:

```typescript
import { RedisBlockingStorage, setDefaultStorage } from 'await-hook';
import { createClientPool } from 'redis';

const pool = createClientPool({ url: 'redis://localhost:6379' });
await pool.connect();

setDefaultStorage(new RedisBlockingStorage({
  getClient: () => pool,
}));
```

With manual connection management (older Redis versions or custom pooling):

```typescript
import { RedisBlockingStorage, setDefaultStorage } from 'await-hook';
import { createClient } from 'redis';

const client = createClient({ url: 'redis://localhost:6379' });
await client.connect();

setDefaultStorage(new RedisBlockingStorage({
  getClient: () => client.duplicate().connect(),
  releaseClient: (c) => c.destroy(),
}));
```

### Redis Pub/Sub

Uses pub/sub for notifications. Only requires two connections regardless of hook count.

```typescript
import { RedisPubSubStorage, setDefaultStorage } from 'await-hook';
import { createClient } from 'redis';

const client = createClient({ url: 'redis://localhost:6379' });

setDefaultStorage(new RedisPubSubStorage({
  getSubscriber: () => client.duplicate().connect(),
  getPublisher: () => client.duplicate().connect(),
  channel: 'hook:events',
  cleanupIntervalMs: 1000,
}));
```

Subscriber and publisher must be separate connections - a Redis client in subscribe mode cannot publish.

### PostgreSQL

Uses LISTEN/NOTIFY. Single connection can both listen and notify.

```typescript
import { PostgresStorage, setDefaultStorage } from 'await-hook';
import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://localhost/mydb' });
await client.connect();

setDefaultStorage(new PostgresStorage({
  getClient: () => client,
  channel: 'hook_events',
  cleanupIntervalMs: 1000,
}));
```

Note: PostgreSQL NOTIFY payloads are limited to 8KB.

## Error Handling

```typescript
import { HookTimeoutError, HookCancelledError } from 'await-hook';

try {
  const result = await hook;
} catch (error) {
  if (error instanceof HookTimeoutError) {
    // Timed out
  } else if (error instanceof HookCancelledError) {
    // Cancelled via hook.cancel()
  }
}
```

## License

MIT
