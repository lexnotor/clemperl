import { z } from "zod";
import { shopProfileFields } from "./shop-profile.schema.js";

// Importé par le formulaire ET par la server action. Les champs commerciaux ne sont pas
// redéclarés ici : ils viennent de `shop-profile.schema.ts`, que la fiche boutique
// emploie aussi. Recopier une règle, c'est se donner deux endroits où la changer.
export const applicationSubmissionSchema = z.object({
    ...shopProfileFields,
    legalForm: z.string().trim().min(2).max(60),
    legalName: z.string().trim().min(2).max(160),
    registrationNumber: z.string().trim().min(4).max(40),
    taxNumber: z.string().trim().max(40).optional(),
    country: z.string().trim().length(2).toUpperCase(),
    locale: z.enum(["fr", "en"]),
});

export type TApplicationSubmission = z.infer<typeof applicationSubmissionSchema>;
