FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Prisma config requires DATABASE_URL even for generate (build-time)
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"

RUN npx prisma generate


ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
