FROM node:18-bullseye-slim

WORKDIR /app

# Install system dependencies untuk Debian slim
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    python3 \
    make \
    g++ \
    git \
    curl \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "start"]
