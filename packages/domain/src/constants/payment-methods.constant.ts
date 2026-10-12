import { E_PAYMENT_METHOD } from "@clemperl/db/enums";

// La PARTITION de l'enum des méthodes de paiement, en deux listes qui se complètent sans se
// recouvrir. C'est d'ici que l'API tire son registre d'adapters et que les écrans tirent ce
// qu'ils ont le droit de promettre : une seule déclaration, donc aucune manière d'être
// incohérent entre le serveur qui encaisse et l'écran qui annonce.
//
// L'import vient de `@clemperl/db/enums`, le sous-chemin sans client Prisma.

// Dérivé de l'énumération générée, comme `TOrderStatus` : une valeur ajoutée au schéma se
// propage ici, et la partition cesse de couvrir l'enum tant qu'elle n'a pas sa ligne.
export type TPaymentMethod = (typeof E_PAYMENT_METHOD)[keyof typeof E_PAYMENT_METHOD];

// Ce qui ne redirige JAMAIS, quel que soit l'environnement : un virement, une remise en main
// propre ou un arrangement de boutique n'a aucun fournisseur à appeler. Ces méthodes
// s'offrent toujours, et se pointent à la main.
export const OFFLINE_PAYMENT_METHODS: readonly TPaymentMethod[] = [
    E_PAYMENT_METHOD.CASH_ON_DELIVERY,
    E_PAYMENT_METHOD.BANK_TRANSFER,
    E_PAYMENT_METHOD.OFF_PLATFORM,
];

// Ce qui a besoin d'un fournisseur pour exister. Figurer ici ne rend PAS une méthode en
// ligne : elle ne l'est que si un adapter la sert réellement, ce que dit
// `onlinePaymentMethods`. Sans adapter, une carte ne redirige nulle part, et promettre un
// bouton « Payer » mènerait l'acheteur dans une impasse.
export const PROVIDER_PAYMENT_METHODS: readonly TPaymentMethod[] = [
    E_PAYMENT_METHOD.CARD,
    E_PAYMENT_METHOD.MOBILE_MONEY,
];
