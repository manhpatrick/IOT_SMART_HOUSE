// Serialize state changes for each device in this single-process starter.
// The MongoDB indexes/conditional updates remain the cross-process guards.
export function createLock() {
  const pending = new Map();
  return function withLock(key, task) {
    const previous = pending.get(key) || Promise.resolve();
    const result = previous.catch(() => {}).then(task);
    const settled = result.catch(() => {});
    pending.set(key, settled);
    settled.finally(() => { if (pending.get(key) === settled) pending.delete(key); });
    return result;
  };
}
