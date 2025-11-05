FROM node:18-alpine

WORKDIR /app

# Install system dependencies untuk Alpine Linux
RUN apk update && apk add --no-cache \
    ffmpeg \
    imagemagick \
    libwebp \
    libwebp-tools \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm config set registry https://registry.npmjs.org/ \
    && npm install --legacy-peer-deps --production \
    && npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev

# Fix permissions
RUN chmod -R 755 /app

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start application
CMD ["npm", "start"]
