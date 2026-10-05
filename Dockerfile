FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html aperture.html lens.html prism.html aperture.js lens.js prism.js lab.css frame.js README.md .nojekyll /srv/
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
