FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production --ignore-scripts

# Copy application code
COPY index.js ./

# Cloud Run uses PORT env var
EXPOSE 8080

CMD ["node", "index.js"]
