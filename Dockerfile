FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:24-slim

ENV NODE_ENV=production
ENV NPM_CONFIG_CACHE=/tmp/npm-cache

WORKDIR /app

COPY package*.json ./
COPY node_modules ./node_modules
COPY distSrc ./distSrc/

EXPOSE 3003
ENTRYPOINT ["node"]
CMD ["distSrc/server.js"]
