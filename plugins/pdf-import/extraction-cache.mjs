// Keep one digest's result, including an in-flight extraction shared by callers.
export function createExtractionCache(extract) {
  let entry;
  return (file, digest) => {
    if (entry?.digest === digest) return { promise: entry.promise, reused: true };
    const next = { digest };
    next.promise = Promise.resolve().then(() => extract(file)).catch(error => {
      if (entry === next) entry = undefined;
      throw error;
    });
    entry = next;
    return { promise: next.promise, reused: false };
  };
}
