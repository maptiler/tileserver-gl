FROM ubuntu:jammy

ENV \
    NODE_ENV="production" \
    CHOKIDAR_USEPOLLING=1 \
    CHOKIDAR_INTERVAL=500

RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    groupadd -r node; \
    useradd -r -g node node; \
    apt-get -qq update; \
    apt-get -y --no-install-recommends install \
      ca-certificates \
      curl \
      gnupg; \
    mkdir -p /etc/apt/keyrings; \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list; \
    apt-get -qq update; \
    apt-get install -y nodejs; \
    npm i -g npm@latest; \
    apt-get -y remove curl gnupg; \
    apt-get -y --purge autoremove; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*;

EXPOSE 8080

RUN mkdir -p /data; \
    chown node:node /data; \
    mkdir -p /usr/src/app;

VOLUME /data

WORKDIR /data

COPY / /usr/src/app

RUN cd /usr/src/app; \
    npm config set maxsockets 1; \
    npm config set fetch-retries 5; \
    npm config set fetch-retry-mintimeout 100000; \
    npm config set fetch-retry-maxtimeout 600000; \
    npm install --omit=dev; \
    chown -R root:root /usr/src/app; \
    chmod +x /usr/src/app/docker-entrypoint.sh;

USER node:node

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]

HEALTHCHECK CMD node /usr/src/app/src/healthcheck.js