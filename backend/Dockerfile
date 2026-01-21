FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

EXPOSE 8000

CMD ["node", "--experimental-sqlite", "server.js"]
