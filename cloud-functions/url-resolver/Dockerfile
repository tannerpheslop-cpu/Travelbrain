FROM ghcr.io/puppeteer/puppeteer:latest

# Install as root
USER root
WORKDIR /home/pptruser/app

# Set Puppeteer cache dir (must match what the base image uses)
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Copy and install dependencies (DO NOT use --ignore-scripts — Puppeteer needs its postinstall to download Chrome)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY index.js ./

# Fix ownership
RUN chown -R pptruser:pptruser /home/pptruser/app

# Run as non-root (required for Puppeteer sandbox)
USER pptruser

EXPOSE 8080
CMD ["node", "index.js"]
