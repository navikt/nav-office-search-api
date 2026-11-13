FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:26-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY server ./server

EXPOSE 3003
ENTRYPOINT ["node"]
CMD ["server/main.ts"]
