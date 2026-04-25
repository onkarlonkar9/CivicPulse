FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN npm --prefix ./backend ci --omit=dev

COPY backend ./backend
COPY frontend/src/data ./frontend/src/data
COPY frontend/public/pune-admin-wards.geojson ./frontend/public/pune-admin-wards.geojson

WORKDIR /app/backend

EXPOSE 4000

CMD ["npm", "start"]
