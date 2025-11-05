FROM node:18-alpine

WORKDIR /app

# Install hanya dependencies yang ESSENTIAL (lebih cepat)
RUN apk update && apk add --no-cache \
    ffmpeg \
    libwebp-tools \
    curl

# Copy package.json saja dulu
COPY package.json .

# FIX: Perbaiki versi cheerio secara otomatis jika masih salah
RUN sed -i 's/"cheerio": "[^"]*"/"cheerio": "^1.0.0-rc.10"/g' package.json

# Install dependencies dengan cache optimization
RUN npm install --legacy-peer-deps --omit=dev --no-audit --no-fund

# Copy sisa source code
COPY . .

# Create necessary directories
RUN mkdir -p views nazedev

EXPOSE 3000

# Simple health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "start"]
