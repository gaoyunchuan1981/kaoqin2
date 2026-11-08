FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV HOST=127.0.0.1
ENV ATTENDANCE_DATA_DIR=/data
ENV ATTENDANCE_DB_PATH=/data/attendance.db
ENV ATTENDANCE_UPLOADS_DIR=/data/uploads
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]