FROM node:22-bullseye

WORKDIR /app
COPY package.json ./
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    npm install
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 5001
CMD ["npm", "run", "start"]
