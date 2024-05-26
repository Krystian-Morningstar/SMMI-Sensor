# Image
FROM node:18.18.0 as node

# Set the working directory
WORKDIR /usr/local/app

# Add the source code to app
COPY ./ /usr/local/app

# Install all the dependencies
RUN npm ci

# Generate the build of the application
RUN npm run build --prod

### Nginx ###

# Imagen
FROM nginx:1.19.8-alpine
# Copy the build output to replace the default nginx contents.
COPY --from=node /usr/local/app/dist/emulador /usr/share/nginx/html
COPY nginx.conf  /etc/nginx/conf.d/default.conf

EXPOSE 80