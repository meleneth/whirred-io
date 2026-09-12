FROM node:20-trixie AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run docs:build

FROM nginx:trixie AS runtime
COPY --from=build /app/docs/.vitepress/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
