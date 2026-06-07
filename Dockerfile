FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache git

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run docs:build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/docs/.vitepress/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
