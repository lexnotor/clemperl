import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import { adapterFor, buildRegistry, isOnline, offlineMethods } from "./registry";

describe("le registre des adapters", () => {
    // La règle centrale : il n'y a AUCUN booléen `isOnline` à tenir à jour à côté du
    // registre, donc aucune manière d'être incohérent.
    it("dit en ligne ce qui a un adapter, hors ligne ce qui n'en a pas", () => {
        const registry = buildRegistry({ simulator: true, secret: "s", publicUrl: "http://a" });
        expect(isOnline(registry, "CARD")).toBe(true);
        expect(isOnline(registry, "MOBILE_MONEY")).toBe(true);
        expect(isOnline(registry, "CASH_ON_DELIVERY")).toBe(false);
        expect(isOnline(registry, "BANK_TRANSFER")).toBe(false);
        expect(isOnline(registry, "OFF_PLATFORM")).toBe(false);
    });

    it("rend les méthodes hors ligne, complément exact des méthodes servies", () => {
        const registry = buildRegistry({ simulator: true, secret: "s", publicUrl: "http://a" });
        expect(offlineMethods(registry).sort()).toEqual([
            "BANK_TRANSFER",
            "CASH_ON_DELIVERY",
            "OFF_PLATFORM",
        ]);
    });

    // Sans simulateur et sans fournisseur réel, AUCUNE méthode n'est en ligne : l'écran du
    // vendeur n'offre alors que les méthodes hors ligne, et rien ne promet une redirection
    // que personne ne sait servir.
    it("n'a aucun adapter quand le simulateur est éteint", () => {
        const registry = buildRegistry({ simulator: false, secret: "s", publicUrl: "http://a" });
        expect(registry.size).toBe(0);
        expect(isOnline(registry, "CARD")).toBe(false);
        expect(adapterFor(registry, "CARD")).toBeNull();
        expect(offlineMethods(registry)).toHaveLength(Object.values(E_PAYMENT_METHOD).length);
    });

    it("rend l'adapter d'une méthode servie, et null sinon", () => {
        const registry = buildRegistry({ simulator: true, secret: "s", publicUrl: "http://a" });
        expect(adapterFor(registry, "CARD")?.provider).toBe("SIMULATED");
        expect(adapterFor(registry, "OFF_PLATFORM")).toBeNull();
        expect(adapterFor(registry, "BITCOIN")).toBeNull();
    });
});
