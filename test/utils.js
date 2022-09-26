const { getPublicUrl } = require('../src/utils');
const should = require('should');

describe('Utils', () => {
    describe('getPublicUrl', () => {
        it('No public url provided returns request protocol and host', () => {
            const req = {
                protocol: 'http',
                headers: {
                    host: 'example.com'
                }
            };
            const expected = 'http://example.com/';

            const value = getPublicUrl(undefined, req);
            should.equal(value, expected);
        });
        it('Absolute public url returns just the public url as it is', () => {
            const req = {
                protocol: 'http',
                headers: {
                    host: 'example.com'
                }
            };
            const expected = 'http://as1.example.com/test/';
            const publicUrl = 'http://as1.example.com/test/';

            const value = getPublicUrl(publicUrl, req);

            should.equal(value, expected);
        });
        it('Relative public url returns public url as an absolute url', () => {
            try {
                const req = {
                    protocol: 'http',
                    headers: {
                        host: 'example.com'
                    }
                };
                const expected = 'http://example.com/test/';
    
                const publicUrl = '/test/';
                process.env.TILESERVER_GL_RESOLVE_RELATIVE_PUBLIC_URL = 'true';
                
                const value = getPublicUrl(publicUrl, req);
    
                should.equal(value, expected);
            } finally {
                process.env.TILESERVER_GL_RESOLVE_RELATIVE_PUBLIC_URL = undefined;
            }
        });
        it('Relative public url returns public url as an relative url', () => {
            const req = {
                protocol: 'http',
                headers: {
                    host: 'example.com'
                }
            };
            const expected = '/test/';

            const publicUrl = '/test/';
            
            const value = getPublicUrl(publicUrl, req);

            should.equal(value, expected);
        });
    });
})