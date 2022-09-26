FROM node:16-bullseye

ENV NODE_ENV="production"
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=500
EXPOSE 80
VOLUME /data
WORKDIR /data
ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]

RUN mkdir -p /usr/src/app
COPY / /usr/src/app
RUN cd /usr/src/app && npm install --production
RUN ["chmod", "+x", "/usr/src/app/docker-entrypoint.sh"]
