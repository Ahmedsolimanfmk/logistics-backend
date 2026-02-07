FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
