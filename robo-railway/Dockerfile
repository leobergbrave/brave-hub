# Imagem oficial do Puppeteer: ja traz o Chrome e todas as bibliotecas de
# sistema que ele exige. Montar isso a mao no Nixpacks costuma quebrar a cada
# atualizacao do Chrome.
FROM ghcr.io/puppeteer/puppeteer:24.10.0

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "index.js"]
