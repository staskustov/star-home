export function createCommandOnce<T>(limit = 1_000) {
  const done = new Map<string, T>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async run(id: string, task: () => Promise<T>): Promise<T> {
      const remembered = done.get(id);
      if (remembered !== undefined) return remembered;
      const pending = inflight.get(id);
      if (pending) return pending;
      const promise = task().then((result) => {
        done.set(id, result);
        if (done.size > limit) {
          const first = done.keys().next().value;
          if (first) done.delete(first);
        }
        return result;
      });
      inflight.set(id, promise);
      try {
        return await promise;
      } finally {
        inflight.delete(id);
      }
    },
    size: () => done.size,
  };
}
