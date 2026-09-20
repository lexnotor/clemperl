# Docker

Tout ce qui concerne la conteneurisation de ClemPerl vit ici : un dossier par service
que nous construisons nous-mêmes, et un fichier de composition par environnement.

## Organisation

| Chemin | Rôle |
| --- | --- |
| `docker-compose.dev.yml` | environnement de développement complet |
| `postgres/` | image de la base, sa locale et sa configuration |
| `redis/` | image de Redis, politique mémoire adaptée à BullMQ |
| `storage/` | Supabase Storage, pièces justificatives des dossiers vendeurs |
| `proxy/` | nginx : terminaison TLS et routage par nom d'hôte |

**Le proxy de développement est nginx brut, et c'est délibéré.** Sa configuration vit
dans un template versionné : `pnpm docker:up` suffit, et l'intégration continue démarre
la stack sans aucune étape manuelle.

Nginx Proxy Manager est prévu pour la **production**, où ses atouts comptent — interface
de gestion, Let's Encrypt automatique, ajout d'un domaine sans redéployer. Il ne convient
pas au développement : sa configuration vit dans une base SQLite hors du dépôt, qu'il
faudrait recréer à la main sur chaque machine et que la CI ne pourrait pas reproduire.

Les images des quatre applications ne sont pas ici : leur `Dockerfile` vit à côté du code
qu'il construit, dans `apps/<application>/`. C'est le seul endroit où une modification du
code et une modification de son image se lisent dans le même diff.

**Aucune image n'est déclarée directement dans un fichier de composition.** Même Postgres
et Redis passent par un `Dockerfile` : c'est le seul endroit où accrocher une
configuration, un script d'initialisation ou une extension, et l'ajouter après coup
demanderait de déplacer un service en production.

## Commandes

Elles se lancent depuis la **racine du dépôt**, jamais depuis ce dossier — le contexte de
build est la racine, et le fichier d'environnement s'y trouve aussi.

    pnpm docker:up      # construit et démarre la stack
    pnpm docker:ps      # état et santé des services
    pnpm docker:logs    # journaux, en continu
    pnpm docker:down    # arrête la stack

Avant le premier démarrage :

    cp .env.example .env

## Points d'entrée

Chaque application publie son propre port. Pas de proxy, pas de TLS : le développement
n'a pas à porter la complexité qui n'a de raison d'être qu'en production.

| Application | Adresse |
| --- | --- |
| storefront | `http://localhost:3000` |
| vendor | `http://localhost:3001` |
| admin | `http://localhost:3002` |
| api | `http://localhost:3003` |
| Mailpit | `http://localhost:8025` |
| Storage | `http://localhost:5010` |

Les cookies de session ne sont pas isolés par port : une session ouverte sur 3000 vaut
sur 3001 et 3002 sans autre réglage. C'est ce qui rend le proxy inutile ici.

Pour joindre la stack depuis un autre appareil du réseau — un téléphone, pour vérifier
la réactivité de l'interface — remplacer `localhost` par la valeur de `DEV_HOST`, qui
porte l'adresse locale de la machine.

## Stockage des pièces

Le service `storage` fait tourner **`supabase/storage-api`**, la même implémentation que
Supabase en production. Le développement exerce donc le vrai chemin de code — même SDK,
mêmes routes, mêmes URL signées — et seul le serveur en face change. Un adapter
« fichiers sur volume » écrit à la main n'aurait pas donné cette garantie.

**La CLI Supabase n'est pas une dépendance de ce dépôt.** Elle lève une dizaine de
conteneurs dont un seul nous intéresse, et trois entrent en collision avec des décisions
déjà prises : GoTrue contre Better Auth, son catcher de courriels contre Mailpit, sa base
contre la nôtre. La configuration du service vient de `.env.sample` du dépôt
`supabase/storage`.

Le bucket `vendor-documents` est **privé** et créé au démarrage par le service
`storage-init` : `pnpm docker:up` suffit, sur une machine neuve comme en CI.

Les objets sont des fichiers ordinaires dans le volume `clemperl_dev_storage_data` :

    docker exec clemperl_dev_storage find /var/lib/storage -type f

### La clé de service est un JWT

Il n'existe pas de « clé de service » à part : c'est un JWT `HS256` portant
`role: service_role`, signé par `STORAGE_JWT_SECRET`. Celui de `.env.example` est une
**constante du dépôt** — `iat` et `exp` fixes — pour valoir à l'identique sur toute
machine. Il n'a aucune valeur de secret : il ne donne accès qu'à une stack locale.

Pour en fabriquer un autre, par exemple après avoir changé le secret :

```bash
python3 - <<'FIN'
import base64, hmac, hashlib, json
SECRET = "le-secret-de-votre-env"
b64 = lambda d: base64.urlsafe_b64encode(d).rstrip(b"=").decode()
e = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
c = b64(json.dumps({"role": "service_role", "iss": "clemperl-dev",
                    "iat": 1750000000, "exp": 2200000000}, separators=(",", ":")).encode())
s = b64(hmac.new(SECRET.encode(), f"{e}.{c}".encode(), hashlib.sha256).digest())
print(f"{e}.{c}.{s}")
FIN
```

En production, le secret se tire au hasard et la clé de service vient du projet Supabase.

## Premier administrateur

Aucun compte n'est semé. Sur une base vierge, `http://localhost:3002/setup` crée le
premier administrateur ; la page **disparaît définitivement** dès qu'il en existe un, et
`/applications` y renvoie tant qu'il n'y en a aucun.

Sa seule barrière est cette absence. En production, ouvrir l'administration
immédiatement après le déploiement, avant que l'adresse ne circule.

## Après l'ajout d'une dépendance

    pnpm docker:down && docker volume rm clemperl_dev_pg_data   # si besoin
    pnpm docker:up

Un volume monté n'est peuplé qu'à sa création : `--build` seul ne suffit pas quand
l'arborescence des dépendances a changé.

## Connexion Google

Le fournisseur n'est actif que si `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont
renseignés, et le bouton n'apparaît que si `NEXT_PUBLIC_GOOGLE_ACTIF` vaut `1`. Sans
eux, le parcours par mot de passe reste entier — l'absence d'identifiants ne bloque
personne.

Dans la console Google Cloud, les URL de redirection autorisées doivent inclure, pour
chaque front :

    http://localhost:3000/api/auth/callback/google
    http://localhost:3001/api/auth/callback/google
    http://localhost:3002/api/auth/callback/google

Google refuse le HTTP en clair pour ses redirections, sauf sur `localhost` — que le
développement joint justement en direct. Un appareil externe, lui, arrive par `DEV_HOST`
et ne peut donc pas emprunter le parcours Google : le mot de passe reste le sien.
