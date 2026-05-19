FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./
COPY providers ./providers
COPY public ./public

EXPOSE 5173

CMD ["npm", "start"]
