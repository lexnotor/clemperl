# Reverse proxy du développement : termine le TLS en 443 et route par nom d'hôte.
# L'image officielle substitue les variables d'environnement dans les fichiers de
# /etc/nginx/templates au démarrage, ce qui laisse `DEV_HOST` piloter les quatre hôtes
# depuis une seule variable.
FROM nginx:1-alpine
COPY docker/proxy/templates/ /etc/nginx/templates/
COPY docker/proxy/snippets/ /etc/nginx/snippets/
EXPOSE 443
