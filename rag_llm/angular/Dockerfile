# Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . ./
RUN npm run build -- --configuration production

# Runtime stage (Nginx static serving)
FROM nginx:alpine
COPY --from=build /app/dist/rag-angular-client/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
