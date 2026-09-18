# Next et React

**Portée : les trois applications Next (`storefront`, `vendor`, `admin`) et
`@clemperl/ui`.**

## Un fichier de composant ne contient que ses propres props

> **Dans un `.tsx`, le seul type défini localement est l'interface de props du
> composant.** Tout type métier — dérivé d'une réponse API, enum de domaine, forme
> partagée entre deux écrans — vit dans `types/` ou `enums/` de la feature, et
> s'importe.

Un type métier déclaré dans un composant n'est pas réutilisable sans importer le
composant lui-même. Le deuxième écran qui en a besoin le **recopie**, et les deux
copies divergent au premier changement de contrat : le compilateur ne voit rien,
puisque chacune est valide isolément.

```typescript
// ❌ Le type de la réponse vit dans un écran ; le suivant le recopiera.
interface IStudentRow { id: string; fullName: string; status: "ACTIVE" | "LEFT" }
interface StudentTableProps { rows: IStudentRow[] }

// ✅ Le contrat vit dans la feature ; le composant ne décrit que lui-même.
import type { IStudentRow } from "../types";
interface StudentTableProps { rows: IStudentRow[] }
```

Le corollaire vaut aussi pour les enums : une valeur de statut affichée par deux
écrans est un enum de domaine, pas une union écrite deux fois.

Quand plusieurs composants partagent un fichier — ce qui est permis pour un composant et
ses sous-composants d'affichage — chacun y déclare ses propres props. La règle porte sur
la nature du type, pas sur leur nombre : des props, oui ; du métier, jamais.

**Cette règle l'emporte sur l'assouplissement « une interface à consommateur unique peut
rester dans son fichier ».** Dans un `.tsx`, un type métier sort même s'il n'a qu'un seul
consommateur, précisément parce qu'un type piégé derrière un composant est un type qu'on
recopie au lieu de l'importer.
