export function generateToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `hook_${crypto.randomUUID()}`;
  }

  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `hook_${timestamp}_${randomPart}`;
}

