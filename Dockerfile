FROM node:24-alpine

WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY distSrc /app/distSrc/

EXPOSE 3003
CMD ["npm", "run", "start"]
