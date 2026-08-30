// Data decorator fixture. Records every call on globalThis so the test can
// assert what the server handed it, then passes the data through untouched.

/**
 * Records the call and returns the data unchanged.
 * @param {string} id - The data source id.
 * @param {string} type - What is being decorated, e.g. 'tilejson' or 'data'.
 * @param {unknown} data - The value being decorated.
 * @returns {unknown} The data, unmodified.
 */
export default function decorate(id, type, data) {
  globalThis.__dataDecoratorCalls = globalThis.__dataDecoratorCalls || [];
  globalThis.__dataDecoratorCalls.push({
    id,
    type,
    // Snapshot rather than store the live object, which the server mutates
    // after the decorator returns.
    sparse: data && data.sparse,
    sparseType: typeof (data && data.sparse),
    tiles: data && data.tiles,
    format: data && data.format,
  });
  // Return a *new* object for tilejson, so a caller that only reassigns its
  // local variable visibly loses the change.
  if (type === 'tilejson' && data && typeof data === 'object') {
    return { ...data, decorated: true };
  }
  return data;
}
