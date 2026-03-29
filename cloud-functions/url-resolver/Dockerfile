FROM ghcr.io/puppeteer/puppeteer:latest

# The puppeteer image runs as 'pptruser' (non-root)
# Set WORKDIR to pptruser's home so npm has write permissions
WORKDIR /home/pptruser/app

# Copy package files and install dependencies
COPY --chown=pptruser:pptruser package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy application code
COPY --chown=pptruser:pptruser index.js ./

# Cloud Run uses PORT env var
EXPOSE 8080

CMD ["node", "index.js"]
