FROM maptiler/tileserver-gl AS deps
FROM gcr.io/distroless/nodejs24-debian12 AS final
COPY --from=deps /usr/bin/which /usr/bin/which
COPY --from=deps /usr/bin/bash /usr/bin/bash
COPY --from=deps /bin/sh /bin/sh
COPY --from=deps /usr/bin/node /usr/bin/node
COPY --from=deps /usr/lib /usr/lib
COPY --from=deps /lib /lib
WORKDIR /usr/src/app
COPY package*.json ./
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/src ./src
COPY --from=deps /usr/src/app/public ./public
COPY docker-entrypoint.sh ./

EXPOSE 8080

ENTRYPOINT ["/bin/sh", "/usr/src/app/docker-entrypoint.sh"]
CMD ["node", "/usr/src/app/"]
