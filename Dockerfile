FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ✅ Generate Prisma client داخل الـ image
RUN npx prisma generate

ENV NODE_ENV=production

# (اختياري) مش مؤثر قوي على Render
EXPOSE 8080

CMD ["npm", "start"]