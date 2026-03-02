FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 👇 مهم جداً: generate بعد copy كامل المشروع
RUN npx prisma generate

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]