import { z } from "zod";

// L'adresse est saisie à chaque commande et FIGÉE dessus : l'acheteur peut déménager, et
// la commande doit dire où elle a été envoyée. Le carnet d'adresses viendra s'il sert, et
// il lira ces commandes.
export const checkoutFields = {
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(30),
    line: z.string().trim().min(4).max(200),
    city: z.string().trim().min(2).max(100),
    // Deux lettres MISES EN MAJUSCULES, exactement comme `Vendor.country` dans
    // `application-submission.schema.ts`. Sans la normalisation, « be » et « BE »
    // s'enregistrent comme deux valeurs distinctes, et tout regroupement par pays se
    // scinderait en silence le jour où la livraison arrivera. Le motif passe avant, parce
    // que `.length(2)` laisserait passer « 12 ».
    country: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/u).toUpperCase(),
    note: z.string().trim().max(1000).optional(),
};

export const checkoutSchema = z.object(checkoutFields);

export type TCheckout = z.infer<typeof checkoutSchema>;
