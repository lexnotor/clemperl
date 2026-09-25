import { DERIVATIVE_WIDTHS } from "../constants/image-derivatives.constant.js";

// Ce fichier est PUR : aucune importation de Node. Il part dans `browser.ts`, que les
// composants client importent pour dériver le chemin d'une vignette.
//
// `buildOriginalPath` vit à côté, dans `media-path.server.utils.ts`, parce qu'il tire
// `node:crypto` — et qu'un composant client qui l'entraînerait casserait le paquet
// navigateur sans que rien ne le nomme. C'est le défaut que T2b a payé avec nodemailer.

export function mediaPrefix(originalPath: string): string {
    return originalPath.slice(0, originalPath.lastIndexOf("/"));
}

export function derivativePath(originalPath: string, width: number): string {
    return `${mediaPrefix(originalPath)}/w${width}.webp`;
}

// ANCRÉ aux deux bouts. Non ancré, ce motif accepterait n'importe quel préfixe et
// n'importe quel suffixe — `../../vendor-documents/...` compris — et la barrière ne
// barrerait plus rien. Combiné au bucket distinct, il fait deux barrières indépendantes :
// même relâché, il ne pourrait atteindre aucun justificatif, qui vit ailleurs.
// Les DÉCLINAISONS seulement. L'original n'est pas servable : il est rendu tel qu'il a
// été déposé, avec le type que le navigateur du vendeur avait déclaré, donc un SVG
// portant un `script` revenait en `image/svg+xml` sur l'origine de la boutique — celle
// qui porte le cookie de session partagé depuis T1a. Les déclinaisons, elles, sortent de
// sharp en WebP : leur contenu et leur type sont les nôtres, pas ceux du déposant.
//
// Rien ne perd cette restriction : les vignettes et T2d lisent des déclinaisons, et
// reproduire celles-ci depuis l'original se fait côté serveur, par `readMedia`.
const SERVABLE = new RegExp(
    `^[a-z0-9]{20,32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/` +
        `w(${DERIVATIVE_WIDTHS.join("|")})\\.webp$`,
);

export function isServableMediaPath(path: string): boolean {
    return SERVABLE.test(path);
}
