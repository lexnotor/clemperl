export * from "./repositories/index.js";
export * from "./client.js";

// `generated/prisma/client` est le point d'entrée désigné par Prisma : il réexporte
// les types de modèles et les enums. Les fichiers de `models/` exposent des types
// internes (`UserModel`, agrégats, entrées de requête) dont les consommateurs n'ont
// pas besoin.
// Les énumérations ont aussi leur propre point d'entrée, `@clemperl/db/enums`, qui
// n'entraîne pas le client Prisma. C'est par lui que passe tout code susceptible
// d'atteindre le navigateur.
export type { User } from "../generated/prisma/client.js";
export type {
    Vendor,
    VendorApplication,
    VendorDecision,
    VendorDocument,
    VendorMember,
} from "../generated/prisma/client.js";
export type {
    Product,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantValue,
} from "../generated/prisma/client.js";
export {
    E_CURRENCY,
    E_PRODUCT_STATUS,
    E_USER_ROLE,
    E_VENDOR_APPLICATION_STATUS,
    E_VENDOR_CATEGORY,
    E_VENDOR_DECISION,
    E_VENDOR_DOCUMENT_KIND,
    E_VENDOR_MEMBER_ROLE,
    E_VENDOR_REJECTION_REASON,
} from "../generated/prisma/client.js";
