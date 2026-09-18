# Discipline de vérification

**Portée : tout le dépôt**, code comme documentation.

Le standard : **une affirmation sur un comportement exige la preuve de l'avoir exécuté.**

## Ce qui compte comme preuve, selon ce qu'on a touché

| Tu as touché…                              | La preuve, c'est…                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Un script                                  | l'exécuter, **y compris ses chemins d'échec**, et montrer la sortie      |
| Une image conteneur                        | la construire, puis vérifier contre l'image construite, pas contre le fichier |
| Un pipeline CI                             | le parser, vérifier la syntaxe de chaque bloc embarqué, et tracer chaque déclencheur en succès, en échec et aux cas limites |
| La stack / la composition de services      | la démarrer et confirmer l'état de santé                                 |
| Une sauvegarde ou une restauration         | prouver la **restauration**, pas la sauvegarde                           |
| Une config que la plateforme valide        | la soumettre à ce validateur sous forme désactivée ou jetable, avant de l'appliquer pour de vrai |
| Un bug                                     | le **reproduire en échec d'abord**. Un test qui n'a jamais échoué ne prouve rien |

La ligne à retenir pour les cas non listés : la preuve porte sur **l'artefact qui
tournera**, jamais sur le texte qui l'a produit.

**Pour tout ce qui concerne le distant** — pointe de branche, mergeabilité, état d'une PR,
résultat d'un workflow, règles de branche — interroger l'API (`gh api`), jamais l'état
local, et dire d'où vient la réponse. C'est le corollaire de l'interdiction de `fetch`
(voir [Git](git.md)) : une ref `origin/*` non rafraîchie se lit exactement comme un fait.

## Distinguer ce qui est vérifié de ce qui est cru

« Vérifié contre la configuration en place » et « ça devrait marcher » sont deux
affirmations différentes et doivent être formulées différemment. Une simulation et une
analyse statique sont des preuves **sur la logique**, pas sur l'exécution réelle : dire
laquelle on a.

## Rapporter un échec comme un échec

Quatre tests cassés sont quatre tests cassés, avec la sortie et les comptes. Ne jamais
arrondir un résultat partiel vers le haut.

Établir si une défaillance **préexistait** au changement avant de l'attribuer. Réparer ce
qu'on a cassé, signaler le reste.

Corriger ses propres erreurs simplement et passer à la suite. Une conclusion fausse
livrée avec assurance coûte plus cher qu'une conclusion jamais produite — donc le dire
directement et corriger.

## Quand on implémente

1. Lire tout ce qui concerne la zone, d'abord
2. Identifier ce qui existe, ce qui manque, ce qui est cassé
3. Produire l'implémentation **complète** : pas de stub, pas de placeholder
4. Vérifier que c'est correct **en l'exécutant**, pas en le relisant
5. La confronter à chaque standard du dépôt avant de la présenter
6. Dire clairement ce qui a été fait, ce que ça remplace ou étend, et pourquoi

## Nettoyer

Conteneurs jetables, images intermédiaires, configurations de test, branches temporaires :
supprimés avant de rendre le travail.

## Quand on rapporte ou qu'on audite

- Énoncer chaque constat en langage clair : ce que c'est, où c'est, ce qui casse à cause de ça
- Grouper par sévérité : Critique, Majeur, Mineur
- Pour chaque constat, donner le correctif, pas seulement le problème
- Ne pas remplir. Si quelque chose va bien, le dire en une ligne et passer
- Ne pas adoucir. Si quelque chose est faux, dire que c'est faux
