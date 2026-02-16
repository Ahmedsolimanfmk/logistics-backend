FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# prisma generate needs DATABASE_URL at build time, but don't persist it in image env
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public" npx prisma generate

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
