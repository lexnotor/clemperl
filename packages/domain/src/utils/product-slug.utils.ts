import { slugify } from "./slug.utils.js";

// Les segments statiques qui vivent sous `/shops/<shop>/`. Next résout un segment statique
// AVANT un segment dynamique, donc un produit portant l'un de ces slugs serait masqué par
// la route homonyme, et sa page répondrait 404 sans que rien ne l'explique.
export const RESERVED_PRODUCT_SLUGS: readonly string[] = ["collections"];

export function isReservedProductSlug(slug: string): boolean {
    return RESERVED_PRODUCT_SLUGS.includes(slug);
}

// La fonction existe pour que l'appelant nomme son intention, et pour que le jour où un
// titre de produit demande une règle propre elle ait un endroit où aller sans toucher aux
// boutiques. Ce jour est arrivé avec les collections, juste au-dessus.
export function slugifyProductTitle(title: string): string {
    return slugify(title);
}
