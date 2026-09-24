// Point d'entrée SANS dépendance serveur, destiné aux composants client.
//
// Le barillet principal réexporte les erreurs du domaine, qui tirent `@clemperl/core`,
// qui expose l'envoi de courriels, qui tire nodemailer, qui tire `node:net`. Turbopack
// refuse alors d'assembler le paquet navigateur, et l'erreur — « the chunking context
// does not support external modules (request: node:net) » — ne nomme aucun de ces
// maillons.
//
// Le même raisonnement que `@clemperl/db/enums` : un sous-chemin étroit vaut mieux
// qu'un barillet qu'on n'ose plus importer.
export * from "./utils/variant-matrix.utils.js";
export * from "./utils/slug.utils.js";
export * from "./utils/product-slug.utils.js";
export * from "./constants/image-derivatives.constant.js";
export * from "./constants/image-failure.constant.js";
export * from "./utils/media-path.utils.js";
export * from "./utils/media-type.utils.js";
