FROM node:20-bullseye

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install --legacy-peer-deps --omit=dev --no-audit --no-fund

# Copy ALL source code
COPY . .

# Create necessary directories
RUN mkdir -p views

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start application
CMD ["npm", "start"]
