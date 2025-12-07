/* eslint-disable @typescript-eslint/no-unused-vars */
'use strict';

export const serve_rendered = {
  init: (options, repo, programOpts) => {},
  add: (options, repo, params, id, programOpts, dataResolver) => {},
  remove: (repo, id) => {},
  clear: (repo) => {},
  getBatchElevationsFromTile: (data, param, pixels) => {
    return pixels.map(({ index }) => ({ index, elevation: null }));
  },
};
