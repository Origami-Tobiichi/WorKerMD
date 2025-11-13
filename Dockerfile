FROM node:20-bullseye

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    curl \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (for better caching)
COPY package*.json ./

# Install npm dependencies
RUN npm install --legacy-peer-deps --omit=dev --no-audit --no-fund

# Copy ALL source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev session sessions tmp

# Set proper permissions
RUN chmod -R 755 nazedev session sessions tmp

EXPOSE 443

# Health check - using /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:443/health || exit 1

# Start application
CMD ["npm", "start"]
