# Supabase Storage, pour que le développement exerce le même client que la production :
# seul le serveur en face change.
#
# Version épinglée : ce service joue ses migrations au démarrage, et une montée de
# version non choisie les jouerait sans qu'on l'ait décidé.
FROM supabase/storage-api:v1.79.4

# Le backend fichier écrit ses objets ici, sous un volume.
RUN mkdir -p /var/lib/storage
