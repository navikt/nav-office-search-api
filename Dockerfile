FROM node:16-alpine

# Create app directory
WORKDIR /app

# Installing dependencies
COPY package*.json /app/
RUN npm ci

# Copy app source
COPY src /app/src/
COPY tsconfig.json /app/

# Start app
EXPOSE 3003
CMD ["npm", "run", "start-docker"]
