FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk update && apk add --no-cache \
    ffmpeg \
    imagemagick \
    webp \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install npm dependencies dengan cache optimization
RUN npm config set registry https://registry.npmjs.org/ \
    && npm install --legacy-peer-deps --production \
    && npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev

# Fix permissions
RUN chmod -R 755 /app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["npm", "start"]
