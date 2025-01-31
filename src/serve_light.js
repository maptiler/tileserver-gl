/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use strict';

export const serve_rendered = {
  init: (options, repo, programOpts) => {},
  add: (options, repo, params, id, programOpts, dataResolver) => {},
  remove: (repo, id) => {},
  clear: (repo) => {},
  getTerrainElevation: (data, param) => {
    param['elevation'] = 'not supported in light';
    return param;
  },
};
