import { E_VENDOR_CATEGORY } from "@clemperl/db/enums";
import { z } from "zod";

// Importé par le formulaire ET par la server action. Les énumérations viennent de
// `@clemperl/db/enums` et non du point d'entrée principal, qui entraînerait le client
// Prisma jusque dans le paquet envoyé au navigateur.
export const applicationSubmissionSchema = z.object({
    // Deux caractères latins au moins, sinon le nom ne produit aucun slug et la boutique
    // n'a pas d'identifiant public. « 日本橋工房 » et « !!! » passaient la seule contrainte
    // de longueur et donnaient une chaîne vide, que la deuxième boutique du genre faisait
    // casser sur l'unicité. La place de marché s'adresse à un public francophone : la
    // contrainte est une décision, pas une limite technique.
    shopName: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/(?:[a-zA-Z0-9].*){2}/u, "doit contenir au moins deux caractères latins"),
    shopDescription: z.string().trim().min(20).max(2000),
    contactEmail: z.email(),
    contactPhone: z.string().trim().min(6).max(30),
    categories: z.array(z.enum(E_VENDOR_CATEGORY)).min(1),
    legalForm: z.string().trim().min(2).max(60),
    legalName: z.string().trim().min(2).max(160),
    registrationNumber: z.string().trim().min(4).max(40),
    taxNumber: z.string().trim().max(40).optional(),
    country: z.string().trim().length(2).toUpperCase(),
    locale: z.enum(["fr", "en"]),
});

export type TApplicationSubmission = z.infer<typeof applicationSubmissionSchema>;
