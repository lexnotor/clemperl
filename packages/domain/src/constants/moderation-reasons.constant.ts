import { E_MODERATION_REASON } from "@clemperl/db/enums";

// L'import vient de `@clemperl/db/enums`, le sous-chemin SANS client Prisma : ce fichier
// est atteignable depuis le navigateur par `browser.ts`.
export const MODERATION_REASONS: readonly string[] = Object.values(E_MODERATION_REASON);
