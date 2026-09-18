# Redis de ClemPerl : file d'attente BullMQ à partir de T2, cache ensuite.
# Comme la base, il a son propre Dockerfile pour que sa configuration ait un endroit où
# vivre le jour où elle cesse d'être celle par défaut.
FROM redis:7-alpine

# BullMQ perd des tâches si Redis évince des clés sous pression mémoire. `noeviction`
# fait échouer l'écriture de façon visible plutôt que de supprimer une tâche en attente.
CMD ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]

EXPOSE 6379
