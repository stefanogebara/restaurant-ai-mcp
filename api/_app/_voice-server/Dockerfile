FROM node:22-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the persistent runtime and its local dependencies
COPY api/_app/_voice-server/ ./api/_app/_voice-server/
COPY api/_app/_lib/ ./api/_app/_lib/
COPY api/_app/_services/ ./api/_app/_services/

EXPOSE 8765

CMD ["node", "api/_app/_voice-server/index.js"]
