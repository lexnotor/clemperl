# Stockage des pièces justificatives. En développement, ce conteneur sert la MÊME API que
# Supabase Storage en production : même SDK, mêmes routes, mêmes URL signées. Un adapter
# « fichiers sur volume » écrit à la main aurait fait exercer au développement un chemin
# de code que la production n'emprunte jamais.
#
# Version épinglée : ce service joue ses propres migrations sur sa base au démarrage, et
# une montée de version non choisie les jouerait sans qu'on l'ait décidé.
FROM supabase/storage-api:v1.79.4

# Le backend fichier écrit des objets ordinaires sous ce chemin, monté en volume : ni S3,
# ni MinIO, ni dépendance réseau, et un `docker exec … ls` suffit à inspecter ce qui a
# été déposé.
RUN mkdir -p /var/lib/storage
