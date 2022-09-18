process.env.NODE_ENV = 'test';

import {expect} from 'chai';
import supertest from 'supertest';
import {server} from '../src/server.js';

global.expect = expect;
global.supertest = supertest;

before(function() {
  console.log('global setup');
  process.chdir('test_data');
  const running = server({
    configPath: 'config.json',
    port: 8888,
    publicUrl: '/test/'
  });
  global.app = running.app;
  global.server = running.server;
  return running.startupPromise;
});

after(function() {
  console.log('global teardown');
  global.server.close(function() {
    console.log('Done'); process.exit();
  });
});
