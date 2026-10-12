import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import {
    OFFLINE_PAYMENT_METHODS,
    PROVIDER_PAYMENT_METHODS,
    type TPaymentMethod,
} from "../constants/payment-methods.constant.js";

// Qui est EN LIGNE, et qui a le droit de l'être. L'API bâtit son registre d'adapters sur ces
// réponses, et les trois écrans du paiement les lisent telles quelles : il n'existe donc
// aucune liste recopiée à côté qu'il faudrait tenir à jour.

// L'environnement réduit à ce que ces questions demandent. `process.env` s'y accorde, et un
// objet littéral aussi : les fonctions restent pures et se testent sans toucher au processus.
export type TPaymentMethodEnv = Readonly<Record<string, string | undefined>>;

// Le SEUL endroit qui décide si le fournisseur simulé est monté. L'API s'en sert pour bâtir
// son registre, les écrans pour savoir ce qu'ils peuvent promettre : un second endroit qui
// relirait la variable à sa façon rouvrirait l'écart que ce fichier ferme.
export function paymentSimulatorEnabled(env: TPaymentMethodEnv): boolean {
    return env["PAYMENT_SIMULATOR"] === "1";
}

// Les méthodes qu'un adapter sert, donc les seules qui redirigent. Aucun fournisseur réel
// n'est branché : seul l'adapter simulé existe, et il sert toutes les méthodes à
// fournisseur. Éteint, la liste est VIDE, et plus rien ne promet une redirection que
// personne ne sait servir.
export function onlinePaymentMethods(env: TPaymentMethodEnv): readonly TPaymentMethod[] {
    return paymentSimulatorEnabled(env) ? PROVIDER_PAYMENT_METHODS : [];
}

export function isOnlinePaymentMethod(env: TPaymentMethodEnv, method: string): boolean {
    // La liste est ÉLARGIE à `string` : l'appelant tient une méthode lue en base ou reçue
    // d'une URL, et la restreindre d'abord demanderait une validation qui n'a rien à voir
    // avec la question posée ici.
    const online: readonly string[] = onlinePaymentMethods(env);
    return online.includes(method);
}

// Ce que l'écran du vendeur a le droit d'offrir : les méthodes hors ligne, plus celles qu'un
// adapter sert.
//
// `accepted` y ajoute ce que la boutique accepte DÉJÀ. Sans cela, une méthode cochée du temps
// où un adapter la servait disparaîtrait du formulaire, et le premier enregistrement la
// retirerait de la base sans que personne ne l'ait décidé. Elle reste donc visible, le
// vendeur la décoche s'il le veut, et elle ne revient pas. Tant qu'elle est là, elle se règle
// hors ligne comme les autres : c'est aussi ce que l'API en fait, faute d'adapter.
//
// L'ordre est celui de l'enum, pour que les cases ne se réarrangent pas d'un environnement à
// l'autre.
export function offerablePaymentMethods(
    env: TPaymentMethodEnv,
    accepted: readonly string[] = [],
): readonly TPaymentMethod[] {
    const online = onlinePaymentMethods(env);
    return Object.values(E_PAYMENT_METHOD).filter(
        (method) =>
            OFFLINE_PAYMENT_METHODS.includes(method) ||
            online.includes(method) ||
            accepted.includes(method),
    );
}

// La méthode dont il faut montrer l'INDICATION à l'acheteur, qui n'est pas toujours la
// méthode de sa commande.
//
// Le bouton « Payer » s'affiche selon la capacité réelle, `isOnlinePaymentMethod`, tandis que
// l'indication se choisissait par le nom de la méthode. Une commande par carte sans adapter
// annonçait donc « Réglez en ligne pour que la boutique prépare votre commande » juste
// au-dessus des coordonnées de la boutique, sans aucun moyen de régler en ligne : l'écran
// demandait une chose et en rendait une autre.
//
// Une méthode qui attend un fournisseur qu'aucun adapter ne sert se règle par arrangement,
// exactement comme `OFF_PLATFORM`, et c'est donc son indication qu'il faut lire. C'est le cas
// courant en production, où le vendeur garde le droit de cocher la carte.
export function paymentHintMethod(env: TPaymentMethodEnv, method: string): string {
    if (isOnlinePaymentMethod(env, method)) {
        return method;
    }
    const avecFournisseur: readonly string[] = PROVIDER_PAYMENT_METHODS;
    return avecFournisseur.includes(method) ? E_PAYMENT_METHOD.OFF_PLATFORM : method;
}
