FROM node:20-alpine

WORKDIR /app

# Install system dependencies if needed (e.g., for prisma or native modules)
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --no-audit --no-fund

COPY . .

RUN npx prisma generate

ENV PORT=5000
EXPOSE 5000

# We use the start script from package.json which handles prisma push and db-sync
CMD ["npm", "start"]
