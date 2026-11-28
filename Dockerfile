FROM node:22-slim

# Install system dependencies (ffmpeg for media, git, curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (including devDependencies for Vite build)
COPY package*.json ./
RUN npm config set allow-git all && npm install

# Copy project source
COPY . .

# Build frontend production bundle
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000 7860 8080

# Use the built-in non-root 'node' user (UID 1000 / GID 1000)
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# Run application server
CMD ["npm", "start"]
