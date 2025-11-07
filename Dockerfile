# Alternative: Use Node.js 20 slim
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    ffmpeg \
    imagemagick \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies dengan force rebuild native modules
RUN npm ci --production --no-optional \
    && npm cache clean --force

# Copy source code
COPY . .

# Create directories
RUN mkdir -p nazedev views sessions

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

# Start application
CMD ["node", "start.js", "--pairing-code"]
