import { E_ORDER_STATUS, E_PAYMENT_METHOD, E_PAYMENT_STATUS } from "@clemperl/db/enums";
import { E_DISPUTE_NOTICE, E_ORDER_ACTION } from "@clemperl/domain";
import { registerEnumType } from "@nestjs/graphql";

// Les cinq énumérations se publient ICI, une fois : un enregistrement par fichier qui les
// emploie les publierait deux fois sous le même nom. Les valeurs viennent des constantes
// existantes, jamais recopiées : un état ajouté à la base arrive au schéma sans qu'on y pense,
// et le téléphone le reçoit par sa clé de catalogue.
registerEnumType(E_ORDER_STATUS, {
    name: "OrderStatus",
    description: "L'état d'une commande dans le parcours de la boutique.",
});

registerEnumType(E_PAYMENT_STATUS, {
    name: "PaymentStatus",
    description: "Où en est le paiement d'une commande, indépendamment de son état.",
});

registerEnumType(E_DISPUTE_NOTICE, {
    name: "DisputeNotice",
    description: "Ce qu'un litige demande encore à la boutique : absent quand rien n'est attendu.",
});

registerEnumType(E_PAYMENT_METHOD, {
    name: "PaymentMethod",
    description: "Comment l'acheteur règle sa commande.",
});

registerEnumType(E_ORDER_ACTION, {
    name: "OrderAction",
    description: "Une action que la boutique peut faire sur une commande dans son état présent.",
});
