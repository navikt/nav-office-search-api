FROM node:22-alpine

WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY distSrc /app/distSrc/

EXPOSE 3003
CMD ["npm", "run", "start"]
