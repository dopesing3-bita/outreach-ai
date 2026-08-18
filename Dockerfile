FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
# Render injects PORT; the app reads process.env.PORT (defaults to 8080).
EXPOSE 8080

CMD ["node", "server/index.js"]
