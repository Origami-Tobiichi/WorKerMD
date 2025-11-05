FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk update && apk add --no-cache \
    ffmpeg \
    imagemagick \
    libwebp-tools \
    curl

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install --legacy-peer-deps --omit=dev

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start application
CMD ["npm", "start"]
