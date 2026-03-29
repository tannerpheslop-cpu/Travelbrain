FROM ghcr.io/puppeteer/puppeteer:latest

# Install as root (Docker build runs as root)
USER root
WORKDIR /home/pptruser/app

# Copy and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy application code
COPY index.js ./

# Fix ownership so pptruser can run the app
RUN chown -R pptruser:pptruser /home/pptruser/app

# Switch back to non-root user (required for Puppeteer)
USER pptruser

EXPOSE 8080
CMD ["node", "index.js"]
