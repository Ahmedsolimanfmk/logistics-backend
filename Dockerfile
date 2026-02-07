FROM node:20-alpine

WORKDIR /app

# 1) Copy package files first
COPY package*.json ./

# 2) Copy prisma files BEFORE npm install (because postinstall runs prisma generate)
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# 3) Install deps (postinstall will now find schema)
RUN npm install

# 4) Copy the rest of the source
COPY . .

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
