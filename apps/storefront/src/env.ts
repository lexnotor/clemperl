import { parseBaseEnv } from "@clemperl/core";

// Évalué à l'import, donc au démarrage : une variable manquante arrête le processus
// avec le nom de la variable, au lieu de produire un `undefined` qui voyage.
export const env = parseBaseEnv(process.env);
