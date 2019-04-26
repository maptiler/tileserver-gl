FROM node:6.15.1-stretch
MAINTAINER Petr Sloup <petr.sloup@klokantech.com>

ENV NODE_ENV="production"
EXPOSE 80
VOLUME /data
WORKDIR /data
ENTRYPOINT ["node", "/usr/src/app/", "-p", "80"]

RUN mkdir -p /usr/src/app
COPY / /usr/src/app
RUN cd /usr/src/app && npm install --production
