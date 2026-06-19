FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# data/ is a volume mount in production (persist catalogs across deploys)
RUN mkdir -p data

EXPOSE 7000

CMD ["node", "server.js"]
