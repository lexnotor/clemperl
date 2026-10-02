# Rédaction

**Portée : tout ce qui se lit en prose dans ce dépôt** : documentation, commentaires de
code, libellés d'interface, messages de commit, descriptions de PR. La langue de chacun
est fixée ailleurs (voir [Git](git.md)) ; ce document parle de la forme, pas de la langue.

## La règle

**Écrire comme un développeur qui explique à un collègue, pas comme un assistant qui
rédige.** Un texte produit par une machine se reconnaît à quelques tics, et ces tics
coûtent la confiance du lecteur : il cesse de lire le fond et commence à juger la forme.

Cette convention ne liste pas des goûts. Elle liste des marqueurs **repérables**, qu'on
peut chercher dans un diff.

## Le tiret quadratin

**Interdit en prose.** Le caractère `—` ne doit apparaître ni dans la documentation, ni
dans les commentaires, ni dans les messages de commit, ni dans les descriptions de PR.

C'est le marqueur le plus visible de tous, parce qu'aucun clavier ne le produit sans
effort : sa présence dit à elle seule que le texte n'a pas été tapé.

Quatre remplacements couvrent tous les cas :

| Ce qu'il faisait | Mettre à la place |
| ---------------- | ----------------- |
| Une incise au milieu d'une phrase | Deux virgules, ou des parenthèses |
| Une rupture avant une explication | Deux-points |
| Une opposition | Un point, et une phrase neuve |
| Une énumération dans une phrase | Une liste, ou des virgules |

Le tiret demi-cadratin `–` tombe sous la même règle. Le trait d'union `-` reste ce qu'il
est : un trait d'union.

**Exception unique :** une citation reproduite telle quelle, ou une sortie de commande
collée verbatim. On ne réécrit pas ce qu'on cite.

## Les autres marqueurs

**Les tournures d'annonce.** « Plongeons dans… », « Explorons… », « Il est important de
noter que… », « En résumé », « En conclusion » sur un texte de dix lignes. Si le point
mérite d'être dit, le dire. Sinon, le couper.

**La symétrie à trois temps.** « Ce n'est pas seulement X, c'est Y. » Les listes qui font
systématiquement trois éléments parce que trois sonne bien. Compter les éléments qu'on a,
pas ceux qui équilibrent la phrase.

**Le gras qui ponctue.** Le gras désigne **une** chose par paragraphe : celle qu'on lirait
si on ne lisait que ça. Trois passages en gras dans une phrase ne soulignent rien, ils
font du bruit.

**Le remplissage prudent.** « Il convient de », « on peut considérer que », « cela
pourrait potentiellement ». Affirmer, ou taire. Une incertitude réelle se dit avec son
motif : « non mesuré », « non vérifié en production ».

**La reformulation de la question.** Commencer une réponse en répétant ce qui vient d'être
demandé. Le lecteur vient de l'écrire, il s'en souvient.

## Pourquoi c'est une convention et pas une préférence

Ce dépôt a une règle sur ce que portent les commentaires, une sur ce que portent les
messages de commit, une sur la longueur des descriptions de PR. Toutes servent le même
lecteur : celui qui arrive après, qui cherche une décision et son motif.

Un texte qui sonne synthétique abîme ce lecteur deux fois. Il le ralentit, et il lui fait
douter que quelqu'un ait vraiment pesé ce qui est écrit.

## Vérifier

Le tiret se cherche, et c'est le seul marqueur qui se cherche mécaniquement :

```
grep -rn "—" --include="*.ts" --include="*.tsx" --include="*.md" . | grep -v node_modules
```

Avant un commit, la même recherche sur le diff seul :

```
git diff --cached | grep -n "^+.*—"
```

Les autres marqueurs se relisent. Un texte qu'on vient d'écrire se relit une fois en se
demandant : est-ce que je dirais ça à voix haute à quelqu'un qui connaît le sujet ?
