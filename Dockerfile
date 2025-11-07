FROM node:18-alpine

# Install dependencies yang diperlukan TERMASUK GIT
RUN apk add --no-cache \
    bash \
    curl \
    ffmpeg \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/cache/apk/*

# Buat directory aplikasi
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies dengan legacy-peer-deps
RUN npm install --production --no-optional --legacy-peer-deps

# Copy source code
COPY . .

# Buat directory untuk session
RUN mkdir -p nazedev session sessions tmp

# Set permissions
RUN chmod -R 755 .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start aplikasi
CMD ["npm", "start"]
