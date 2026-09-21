import { z } from "zod";

// Le titre produit le slug, donc la même exigence que pour un nom de boutique : deux
// caractères latins au moins. Sans eux le slug est vide, et le deuxième produit du
// genre casse sur l'unicité avec un message de base que personne ne relie à sa saisie.
export const productDetailsFields = {
    title: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/(?:[a-zA-Z0-9].*){2}/u, "doit contenir au moins deux caractères latins"),
    description: z.string().trim().min(20).max(4000),
};

export const productDetailsSchema = z.object(productDetailsFields);

export type TProductDetails = z.infer<typeof productDetailsSchema>;

// Un axe et ses valeurs, tels que le formulaire les envoie. Les doublons sont refusés
// ICI plutôt qu'en base : « Noir » deux fois dans le même axe produirait deux variantes
// que l'index unique rejetterait, et l'erreur remontée ne dirait pas pourquoi.
export const productOptionSchema = z.object({
    name: z.string().trim().min(1).max(40),
    values: z
        .array(z.string().trim().min(1).max(40))
        .min(1)
        .max(20)
        .refine((values) => new Set(values).size === values.length, {
            message: "deux valeurs identiques dans le même axe",
        }),
});

// Le nombre de variantes qu'une boutique peut décrire d'un seul produit. Ce n'est pas
// la limite de la base : c'est celle de l'écran, qui rend un champ de prix par ligne, et
// celle de la transaction, qui insère chaque variante séquentiellement.
export const MAX_VARIANTS_PER_PRODUCT = 100;

export const productOptionsSchema = z
    .array(productOptionSchema)
    // Trois axes au plus.
    .max(3)
    .refine((options) => new Set(options.map((option) => option.name)).size === options.length, {
        message: "deux axes portent le même nom",
    })
    // Borner les AXES ne borne pas la grille : trois axes de vingt valeurs font huit
    // mille variantes, toutes issues d'une saisie parfaitement valide. C'est le produit
    // cartésien qu'il faut plafonner, pas ses facteurs.
    .refine(
        (options) =>
            options.reduce((total, option) => total * Math.max(option.values.length, 1), 1) <=
            MAX_VARIANTS_PER_PRODUCT,
        { message: `plus de ${MAX_VARIANTS_PER_PRODUCT} déclinaisons pour un seul produit` },
    );

export type TProductOption = z.infer<typeof productOptionSchema>;
