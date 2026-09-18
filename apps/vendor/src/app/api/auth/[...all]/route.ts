import { auth } from "@clemperl/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Le gestionnaire est monté dans CHAQUE front, mais la configuration vit à un seul
// endroit. Rien ne traverse de domaine : aucune requête d'authentification ne sort de
// l'application qui la reçoit, donc aucun CORS ni cookie en contexte croisé.
export const { GET, POST } = toNextJsHandler(auth);
