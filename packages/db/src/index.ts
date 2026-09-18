export * from "./client.js";

// `generated/prisma/client` est le point d'entrée désigné par Prisma : il réexporte
// les types de modèles et les enums. Les fichiers de `models/` exposent des types
// internes (`UserModel`, agrégats, entrées de requête) dont les consommateurs n'ont
// pas besoin.
export type { User } from "../generated/prisma/client.js";
export { E_USER_ROLE } from "../generated/prisma/client.js";
