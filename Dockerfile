FROM node:20-bullseye

WORKDIR /app

# Install dependencies
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Fix dan install
RUN sed -i 's/"cheerio": "[^"]*"/"cheerio": "^1.0.0-rc.10"/g' package.json && \
    npm install --legacy-peer-deps --omit=dev

COPY . .

RUN mkdir -p views nazedev

EXPOSE 3000

CMD ["npm", "start"]
