FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy only the files needed for the voice server
COPY api/voice-server/ ./api/voice-server/
COPY api/_lib/ ./api/_lib/

EXPOSE 8765

CMD ["node", "api/voice-server/index.js"]
