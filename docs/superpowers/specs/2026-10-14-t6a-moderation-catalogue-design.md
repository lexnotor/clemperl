# ClemPerl, T6a : modérer le catalogue

**Date** : 2026-10-14
**Statut** : cadrée, non commencée
**Tranche** : T6a, première des trois issues du découpage de T6
**S'appuie sur** : `2026-09-19-t1b-vendeurs-design.md` (le motif codé, le commentaire et le
courriel d'une décision), `2026-10-02-t2d-catalogue-public-design.md` (le prédicat
d'éligibilité) et `2026-10-13-t5-suspension-boutique-design.md` (l'écran d'administration
sur une boutique vivante), toutes livrées

---

## 1. Objectif

Un administrateur retire du catalogue un produit qui n'a rien à y faire, sans punir toute la
boutique.

Jusqu'ici le seul levier était la suspension, livrée en T5 : elle coupe la vente de tous les
articles d'une boutique pour un seul qui pose problème. T6a donne l'outil précis à côté de
l'outil brutal.

## 2. Ce que T6a décide

### Le retrait est un AVERTISSEMENT, pas une condamnation

Il dépublie le produit et prévient son vendeur. Le vendeur peut republier.

C'est un choix, et il a un coût assumé : un contenu illicite revient d'un clic, et le recours
redevient alors la suspension de la boutique. Ce que l'avertissement achète en échange, c'est
l'absence d'un état que le vendeur ne contrôle pas, donc l'absence d'une contestation à
instruire et d'un recours à bâtir.

Conséquence directe sur le modèle : **aucun état nouveau**. Le retrait écrit
`status: DRAFT`, exactement ce qu'une dépublication par le vendeur écrit.

### Ce qui distingue un retrait d'une dépublication est le MOTIF, pas l'état

Les deux posent `DRAFT`. Ce qui les sépare est que le retrait part avec un motif codé et un
courriel, sur la forme que T1b a écrite pour le refus d'une candidature : une énumération,
un commentaire obligatoire quand le motif est « autre », et un message rédigé dans la langue
du vendeur.

Reprendre cette forme plutôt qu'en inventer une seconde : le dépôt a déjà payé la rédaction
de ces messages et la règle « commentaire obligatoire si le motif est autre » vit dans
`packages/domain`, éprouvée.

### Le retrait porte sur le PRODUIT, jamais sur une photo seule

Retirer une image laisserait un article publié avec une vignette en moins, et le vendeur en
remettrait une autre sans comprendre ce qu'on lui reproche. Un produit dont une photo pose
problème se retire en entier, et le motif dit laquelle.

## 3. Les tags système

### Ce qu'ils sont

Un tableau d'énumération sur `Product`, à la manière de `Vendor.paymentMethods` : un
vocabulaire FERMÉ, décidé dans le code, dont un produit porte zéro, un ou plusieurs éléments.

```prisma
enum E_PRODUCT_TAG {
  REVIEWED

  @@map("product_tag")
}
```

Le vocabulaire démarre avec une seule valeur, et c'est voulu. Un tag se gagne : il entre
quand un écran en a besoin, pas quand quelqu'un l'imagine. Chaque ajout passe par une
migration, ce qui est une friction utile, puisque personne n'invente alors un vocabulaire
parallèle un mardi après-midi.

### Pourquoi un tableau d'enum et non une table de liaison

Même raisonnement que `paymentMethods` en T4 : une table dont toutes les colonnes sauf deux
seraient vides mentirait sur ce qu'elle porte. Un tag n'a ni date propre, ni auteur, ni
commentaire. Le jour où il en aurait besoin, ce ne serait plus un tag mais un acte, et sa
place serait dans un journal, que T6 a explicitement écarté.

### Ce qu'ils ne sont PAS

Pas des étiquettes libres. Deux administrateurs écriraient « a-verifier » et « à vérifier »,
aucun filtre ne les réunirait, et rien ne serait traduisible.

Pas visibles du vendeur, ni du public. Ce sont des marques de travail interne, et `REVIEWED`
ne dit rien d'autre que « quelqu'un a regardé ».

## 4. La file de modération

### Sa définition

**Les produits publiés qui ne portent pas `REVIEWED`**, du plus récemment publié au plus
ancien.

Elle se VIDE, et c'est sa propriété importante : un administrateur sait qu'il a fini. Un
filtre par date ne le dirait jamais, et deux administrateurs s'y recouvriraient sans le
savoir.

### Les deux actions d'une ligne

**Examiné** pose le tag `REVIEWED` et la ligne quitte la file. Rien d'autre ne change : le
produit reste publié et vendable.

**Retirer** ouvre le motif, dépublie, et envoie le courriel. La ligne quitte la file parce
que le produit n'est plus publié.

### Republier retire le tag `REVIEWED`

C'est la règle qui donne son mordant à l'avertissement, et elle est la conséquence directe du
choix de la section 2.

Sans elle, un vendeur dont le produit a été retiré le republie et ne repasse devant personne,
puisque le produit porterait encore `REVIEWED`. L'avertissement n'avertirait rien.

Avec elle, toute republication ramène l'article dans la file, et l'administrateur voit que
son retrait a été outrepassé.

Cela couple `setProductStatus` à la modération, ce qui se défend : c'est exactement le point
où l'on veut savoir. La règle vaut pour TOUTE republication, qu'un retrait l'ait précédée ou
non, parce que distinguer les deux demanderait de retenir qu'un retrait a eu lieu, donc le
journal que T6 a écarté.

## 5. Les écrans

### `/moderation`, dans l'administration

La file, sur la forme de `/shops` livrée en T5 : une liste, une ligne par produit, les
actions sur la ligne.

Chaque ligne porte le titre, la boutique AVEC SON SLUG, la date de publication et la
vignette. Le slug pour la raison que la revue de T5 a nommée : `shopName` n'est pas unique,
et deux lignes indistinguables feraient agir sur le mauvais produit.

La vignette parce qu'on modère d'abord avec les yeux, et qu'ouvrir chaque fiche pour voir une
image rendrait la file inutilisable.

### Le formulaire de retrait

Un motif codé, et un commentaire obligatoire quand le motif est « autre ». Rendu sur la ligne
plutôt que sur une page à part : une file se traite sans naviguer.

### Rien côté vendeur

Aucun écran nouveau. Le vendeur apprend le retrait par courriel, et retrouve son produit en
brouillon là où il l'a toujours vu. Lui ajouter un écran de contestation serait construire le
recours que la section 2 a justement écarté.

### Rien côté public

Aucun bouton « signaler ». C'est le choix de la file par nouveautés : l'administration
regarde ce qui paraît, elle n'attend pas qu'on lui signale. Le jour où le volume dépassera ce
qu'un humain parcourt, le signalement sera la sortie, et il aura sa propre tranche.

## 6. Ce que T6a ne fait pas

**Aucun journal des actes.** Qui a retiré quoi, quand, et pourquoi n'est conservé nulle part.
Le courriel parti chez le vendeur en est la seule trace. C'est la limite que T5 a déjà posée
pour la suspension, et T6 l'a maintenue en écartant le journal de son périmètre.

**Aucune modération de la boutique elle-même.** Son nom, sa description et ses images
publiques ne sont pas couverts. Le levier reste la suspension de T5.

**Aucune modération des collections**, pour la même raison.

**Aucun compteur de récidive.** Un vendeur peut être averti dix fois sans que rien ne
s'accumule, puisque rien n'est conservé.

## 7. Les cas limites

Un produit retiré puis republié revient dans la file, en tête, sa date de publication étant
récente.

Un produit d'une boutique suspendue n'est pas dans la file : il n'est plus publié au sens du
catalogue, et la suspension est déjà la décision la plus forte.

Un produit supprimé par son vendeur disparaît de la file.

Deux administrateurs traitant la même ligne : poser `REVIEWED` deux fois est sans effet, et
retirer un produit déjà retiré écrit `DRAFT` sur ce qui est déjà `DRAFT`. Aucun refus à
expliquer, comme la suspension de T5.

## 8. Tests

**Pur, dans `packages/domain`** : la validation du motif de retrait, dont le commentaire
obligatoire quand le motif est « autre ». La règle existe pour les candidatures ; si elle se
réutilise telle quelle, le test le constate plutôt que de la recopier.

**Intégration, contre le vrai PostgreSQL** : la file ne rend que les publiés sans `REVIEWED`,
dans le bon ordre ; poser `REVIEWED` sort la ligne de la file ; retirer dépublie ; republier
retire le tag et ramène la ligne ; un produit d'une boutique suspendue n'y est pas ; et les
deux actions sont idempotentes.

**Ce que la modération NE touche PAS**, sur la forme du fichier que T5 a écrit : un retrait
ne change ni le panier d'un acheteur, ni ses commandes passées, ni l'espace du vendeur.

**Navigateur** : un vendeur publie, l'administrateur voit l'article en file, le retire avec un
motif, le vendeur le retrouve en brouillon, le republie, et l'article revient en file.

## 9. Critères d'acceptation

1. La file ne montre que des produits publiés sans `REVIEWED`, du plus récent au plus ancien
2. Marquer examiné sort la ligne de la file sans rien changer d'autre
3. Retirer dépublie, part avec un motif codé, et envoie un courriel au vendeur dans sa langue
4. Un commentaire est exigé quand le motif est « autre »
5. Republier retire `REVIEWED` et ramène l'article dans la file
6. Un produit d'une boutique suspendue n'apparaît pas dans la file
7. Les deux actions sont idempotentes et ne produisent aucun refus à expliquer
8. Chaque ligne identifie sa boutique par son slug autant que par son nom
9. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 10. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **Un contenu illicite republié en boucle** | La modération ne mord pas | Assumé : le recours est la suspension de T5, et la republication ramène l'article en file |
| **La file ne passe pas à l'échelle** | Un humain ne parcourt pas mille publications par jour | Assumé pour ce volume ; le signalement par les visiteurs est la sortie, et sa propre tranche |
| **Le couplage de `setProductStatus` à la modération** | Une republication oublie de retirer le tag | Un test d'intégration le tient, et c'est le seul endroit qui publie |
| **Aucune trace des retraits** | Impossible de dire qu'un vendeur récidive | Assumé par le périmètre de T6 ; le journal reste à faire et se poserait à côté |
