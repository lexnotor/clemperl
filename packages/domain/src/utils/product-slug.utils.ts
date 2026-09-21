import { slugify } from "./slug.utils.js";

// Même opération que pour une boutique, sur une autre entrée. La fonction existe pour
// que l'appelant nomme son intention, et pour que le jour où un titre de produit
// demande une règle propre — un numéro de série, une déduplication — elle ait un
// endroit où aller sans toucher aux boutiques.
export function slugifyProductTitle(title: string): string {
    return slugify(title);
}
