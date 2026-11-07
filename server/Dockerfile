FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

VOLUME ["/app/uploads", "/app/attendance.db"]

CMD ["node", "server.js"]
