// Async data decorator fixture. Resolves on a later tick before returning, so
// a caller that does not await it gets a promise rather than the data.

/**
 * Marks the TileJSON after yielding to the event loop.
 * @param {string} id - The data source id.
 * @param {string} type - What is being decorated, e.g. 'tilejson' or 'data'.
 * @param {unknown} data - The value being decorated.
 * @returns {Promise<unknown>} The data, marked when it is TileJSON.
 */
export default async function decorate(id, type, data) {
  await new Promise((resolve) => setTimeout(resolve, 1));
  if (type === 'tilejson' && data && typeof data === 'object') {
    return { ...data, decoratedAsync: true };
  }
  return data;
}
