FROM node:16-alpine

# Create app directory
WORKDIR /app

# Installing dependencies
COPY package*.json /app/
RUN npm ci

# Copy app source
COPY src /app/src/
COPY tsconfig.json /app/

# Set permission/ownership needed for build output
# (1069 is the uid for the app process in containers on nais)
RUN mkdir -p /app/distSrc
RUN chown -R 1069 /app/distSrc

# Start app
EXPOSE 3003
CMD ["npm", "run", "start-docker"]
