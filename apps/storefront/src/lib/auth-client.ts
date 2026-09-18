import { createAuthClient } from "better-auth/react";

// Client de navigateur. Il dépend de `better-auth` directement et NON de
// `@clemperl/auth` : ce dernier est un package serveur qui importe Prisma, et
// l'importer ici ferait entrer le client de base de données dans le paquet envoyé au
// navigateur.
//
// L'URL de base reste relative : le gestionnaire est monté dans cette application même,
// et une URL absolue introduirait une origine différente donc du CORS.
export const authClient = createAuthClient();
