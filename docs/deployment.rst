==========
Deployment
==========

Typically, you should use nginx, lighttpd or apache on the frontend. The tileserver-gl server is hidden behind it in production deployment.

Caching
=======

There is a plenty of options you can use to create proper caching infrastructure: Varnish, CloudFlare, ...

Securing
========

Nginx can be used to add protection via https, password, referrer, IP address restriction, access keys, etc.

Running behind a proxy or a load-balancer
=========================================

If you need to run TileServer GL behind a proxy, make sure the proxy sends ``X-Forwarded-*`` headers to the server (most importantly ``X-Forwarded-Host`` and ``X-Forwarded-Proto``) to ensure the URLs generated inside TileJSON, etc. are using the desired domain and protocol.
