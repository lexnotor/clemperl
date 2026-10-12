import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import { describe, expect, it } from "vitest";
import { OFFLINE_PAYMENT_METHODS, PROVIDER_PAYMENT_METHODS } from "../constants/index.js";
import {
    isOnlinePaymentMethod,
    offerablePaymentMethods,
    onlinePaymentMethods,
    paymentHintMethod,
    paymentSimulatorEnabled,
} from "./payment-methods.utils.js";

const ALLUME = { PAYMENT_SIMULATOR: "1" };
const ETEINT = { PAYMENT_SIMULATOR: "0" };

describe("la partition des méthodes de paiement", () => {
    // Une valeur ajoutée à l'enum sans sa ligne dans l'une des deux listes ne serait jamais
    // offerte au vendeur : elle manquerait à l'écran, sans que rien ne le signale. Ce test
    // est ce qui le signale.
    it("couvre l'enum entier, sans recouvrement", () => {
        const partition = [...OFFLINE_PAYMENT_METHODS, ...PROVIDER_PAYMENT_METHODS];

        expect(partition.toSorted()).toEqual(Object.values(E_PAYMENT_METHOD).toSorted());
        expect(new Set(partition).size).toBe(partition.length);
    });
});

describe("le simulateur", () => {
    it("n'est allumé que par la valeur 1", () => {
        expect(paymentSimulatorEnabled(ALLUME)).toBe(true);
        expect(paymentSimulatorEnabled(ETEINT)).toBe(false);
        expect(paymentSimulatorEnabled({ PAYMENT_SIMULATOR: "true" })).toBe(false);
        expect(paymentSimulatorEnabled({})).toBe(false);
    });
});

describe("les méthodes en ligne", () => {
    it("sont les méthodes à fournisseur quand le simulateur est allumé", () => {
        expect(onlinePaymentMethods(ALLUME)).toEqual(PROVIDER_PAYMENT_METHODS);
        expect(isOnlinePaymentMethod(ALLUME, E_PAYMENT_METHOD.CARD)).toBe(true);
        expect(isOnlinePaymentMethod(ALLUME, E_PAYMENT_METHOD.BANK_TRANSFER)).toBe(false);
    });

    // Aucun fournisseur réel n'est branché : simulateur éteint, PLUS RIEN n'est en ligne.
    // C'est la seule configuration que la production autorise aujourd'hui, et c'est celle
    // où un écran qui promet une redirection mène dans une impasse.
    it("n'existent pas quand le simulateur est éteint", () => {
        expect(onlinePaymentMethods(ETEINT)).toEqual([]);
        expect(isOnlinePaymentMethod(ETEINT, E_PAYMENT_METHOD.CARD)).toBe(false);
        expect(isOnlinePaymentMethod(ETEINT, E_PAYMENT_METHOD.MOBILE_MONEY)).toBe(false);
    });
});

describe("ce que l'écran du vendeur offre", () => {
    it("ajoute aux méthodes hors ligne celles qu'un adapter sert", () => {
        expect(offerablePaymentMethods(ALLUME)).toEqual(Object.values(E_PAYMENT_METHOD));
    });

    it("se réduit aux méthodes hors ligne sans adapter", () => {
        expect(offerablePaymentMethods(ETEINT)).toEqual([
            E_PAYMENT_METHOD.CASH_ON_DELIVERY,
            E_PAYMENT_METHOD.BANK_TRANSFER,
            E_PAYMENT_METHOD.OFF_PLATFORM,
        ]);
    });

    // Une boutique qui accepte encore la carte alors qu'aucun adapter ne la sert garde sa
    // case : la faire disparaître ferait retirer la méthode de la base au premier
    // enregistrement, sans que le vendeur l'ait décidé.
    it("garde la méthode qu'une boutique accepte déjà, même sans adapter", () => {
        expect(offerablePaymentMethods(ETEINT, [E_PAYMENT_METHOD.CARD])).toEqual([
            E_PAYMENT_METHOD.CARD,
            E_PAYMENT_METHOD.CASH_ON_DELIVERY,
            E_PAYMENT_METHOD.BANK_TRANSFER,
            E_PAYMENT_METHOD.OFF_PLATFORM,
        ]);
    });

    it("n'offre pas deux fois une méthode déjà servie et déjà acceptée", () => {
        expect(offerablePaymentMethods(ALLUME, [E_PAYMENT_METHOD.CARD])).toEqual(
            Object.values(E_PAYMENT_METHOD),
        );
    });
});

describe("paymentHintMethod", () => {
    // L'indication montrée à l'acheteur était choisie par le NOM de la méthode, alors que
    // le bouton « Payer » s'affiche selon la CAPACITÉ réelle. Une commande par carte sans
    // adapter annonçait donc « Réglez en ligne » au-dessus des coordonnées de la boutique,
    // sans aucun moyen de régler en ligne.
    it("rend la méthode elle-même quand un adapter la sert", () => {
        expect(paymentHintMethod(ALLUME, E_PAYMENT_METHOD.CARD)).toBe(E_PAYMENT_METHOD.CARD);
    });

    it("rend la méthode elle-même pour ce qui se règle toujours hors ligne", () => {
        for (const method of OFFLINE_PAYMENT_METHODS) {
            expect(paymentHintMethod(ETEINT, method)).toBe(method);
            expect(paymentHintMethod(ALLUME, method)).toBe(method);
        }
    });

    // C'est le cas que la décision « le vendeur peut cocher la carte » rend courant en
    // production : la méthode reste cochée, la commande se règle par arrangement, et c'est
    // cela qu'il faut dire plutôt que de promettre une redirection qui n'existe pas.
    it("renvoie vers l'arrangement quand la méthode attend un fournisseur absent", () => {
        for (const method of PROVIDER_PAYMENT_METHODS) {
            expect(paymentHintMethod(ETEINT, method)).toBe(E_PAYMENT_METHOD.OFF_PLATFORM);
        }
    });
});
