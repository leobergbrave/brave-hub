# Imagem oficial do Puppeteer: ja traz todas as bibliotecas de sistema que o
# Chrome exige no Linux (montar isso a mao quebra a cada atualizacao).
FROM ghcr.io/puppeteer/puppeteer:24.10.0

# Ghostscript recomprime o PDF pronto (as fotos de produto do Bling saem em
# resolucao cheia e estouram 55MB). Precisa de root para o apt; a imagem roda
# como pptruser, entao troca-se de usuario so para instalar e volta em seguida.
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ghostscript \
  && rm -rf /var/lib/apt/lists/*
USER pptruser

WORKDIR /app

# Nao apontamos PUPPETEER_EXECUTABLE_PATH: a primeira tentativa fixou
# /usr/bin/google-chrome-stable, que NAO existe nesta imagem — o Chrome dela
# fica no cache do usuario pptruser. Deixando o proprio Puppeteer resolver o
# caminho, a versao do navegador sempre bate com a da biblioteca.
COPY --chown=pptruser:pptruser package.json ./
RUN npm install --omit=dev
COPY --chown=pptruser:pptruser . .

CMD ["node", "index.js"]
