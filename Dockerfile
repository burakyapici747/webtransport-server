FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY index.js ./
COPY index.html ./
COPY open_browser.sh ./

# Copy SSL certificates
COPY ../cert.pem ./
COPY ../fullchain.pem ./
COPY ../privkey.pem ./

RUN npm install

EXPOSE 8443

CMD ["node", "index.js"] 