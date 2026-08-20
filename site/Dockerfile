# Site static: nu se compileaza nimic, doar se serveste folderul.
FROM nginx:1.27-alpine

# curl e pentru healthcheck-ul Coolify, care nu vine cu imaginea
RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

EXPOSE 80
