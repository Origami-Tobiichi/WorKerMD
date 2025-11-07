# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Install required system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    ffmpeg \
    imagemagick \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production --no-optional

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p \
    nazedev \
    views \
    src \
    lib \
    sessions

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

# Start the application
CMD ["node", "start.js", "--pairing-code"]
