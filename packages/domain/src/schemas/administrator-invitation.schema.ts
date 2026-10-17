import { z } from "zod";

// L'invitation d'un administrateur. Le vocabulaire est fermé aux deux niveaux qu'on accorde :
// `CUSTOMER` n'en fait pas partie, et ce schéma ne reprend pas l'énumération Prisma, qui
// la porte. Un client ne se nomme pas, il se retire.
export const administratorInvitationSchema = z.object({
    name: z.string().trim().min(1).max(80),
    email: z.email(),
    role: z.enum(["ADMIN", "SUPER_ADMIN"]),
});

export type TAdministratorInvitation = z.infer<typeof administratorInvitationSchema>;
