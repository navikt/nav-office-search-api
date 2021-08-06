FROM node:16-alpine

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Installing dependencies
COPY package*.json /usr/src/app/
RUN npm ci

# Copy app source
COPY distSrc /usr/src/app/src/

# Copy app data
COPY data /usr/src/app/data/

# Start app
EXPOSE 3003
CMD ["npm", "run", "start"]
