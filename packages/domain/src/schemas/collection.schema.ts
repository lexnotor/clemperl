import { z } from "zod";
import { slugify } from "../utils/slug.utils.js";

// Un titre de collection produit son slug, donc la même exigence que pour une boutique ou
// un produit : deux caractères latins au moins. Sans eux le slug est vide, et la deuxième
// collection du genre casse sur l'unicité avec un message de base que personne ne relie à
// sa saisie.
export const collectionDetailsFields = {
    title: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/(?:[a-zA-Z0-9].*){2}/u, "doit contenir au moins deux caractères latins"),
    description: z.string().trim().max(2000).optional(),
};

export const collectionDetailsSchema = z.object(collectionDetailsFields);

// Aucune règle propre pour l'instant, contrairement au titre de produit qui doit éviter le
// slug réservé. La fonction existe pour que l'appelant nomme son intention, et pour que
// cette règle ait un endroit où aller le jour où elle arrive.
export function slugifyCollectionTitle(title: string): string {
    return slugify(title);
}
