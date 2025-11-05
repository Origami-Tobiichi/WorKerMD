FROM node:18-bullseye

WORKDIR /app

# Install system dependencies untuk Debian
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    curl \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Perbaiki versi cheerio jika masih salah
RUN if grep -q '"cheerio": "^1.0.-rc.10"' package.json; then \
        sed -i 's/"cheerio": "^1.0.-rc.10"/"cheerio": "^1.0.0-rc.10"/g' package.json; \
        echo "Fixed cheerio version in package.json"; \
    fi

# Install npm dependencies
RUN npm install --legacy-peer-deps --omit=dev --no-audit --no-fund

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "start"]
