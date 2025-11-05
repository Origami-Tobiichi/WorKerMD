FROM node:18-alpine

WORKDIR /app

# Install system dependencies untuk Alpine Linux
RUN apk update && apk add --no-cache \
    ffmpeg \
    imagemagick \
    libwebp-tools \
    python3 \
    make \
    g++ \
    git \
    curl

# Copy package files
COPY package*.json ./

# Fix cheerio version jika masih ada masalah (opsional - backup)
RUN sed -i 's/"cheerio": "^1.0.-rc.10"/"cheerio": "^1.0.0-rc.10"/g' package.json

# Install npm dependencies
RUN npm install --legacy-peer-deps --omit=dev

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev

EXPOSE 3000

# Health check menggunakan curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start application
CMD ["npm", "start"]
