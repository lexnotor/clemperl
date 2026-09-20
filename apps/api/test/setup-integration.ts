import { getTestDatabaseUrl } from "./test-database";

// Le client Prisma de `@clemperl/db` lit `DATABASE_URL` au moment où son module est
// évalué. Ce fichier tourne AVANT le premier import du test : il redirige la variable
// vers la base jetable, si bien que la couche d'intégration exerce le vrai câblage du
// package plutôt qu'un client monté pour l'occasion.
process.env["DATABASE_URL"] = getTestDatabaseUrl();
