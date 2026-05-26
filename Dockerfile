FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY package.json server.js ./
COPY public ./public

EXPOSE 8080

CMD ["node", "server.js"]
