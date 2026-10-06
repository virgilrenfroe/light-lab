FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html aperture.html lens.html prism.html film.html polar.html slits.html mirror.html sky.html color.html absorb.html shadow.html aperture.js lens.js prism.js film.js polar.js slits.js mirror.js sky.js color.js absorb.js shadow.js lab.css frame.js README.md .nojekyll /srv/
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
