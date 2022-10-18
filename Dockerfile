FROM node:18-alpine

# Create app directory
WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY distSrc /app/distSrc/

# Start app
EXPOSE 3003
CMD ["npm", "run", "start"]
