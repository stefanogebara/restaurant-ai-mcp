FROM node:22-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the persistent runtime and its local dependencies
COPY api/_voice-server/ ./api/_voice-server/
COPY api/_lib/ ./api/_lib/
COPY api/_services/ ./api/_services/

EXPOSE 8765

CMD ["node", "api/_voice-server/index.js"]
