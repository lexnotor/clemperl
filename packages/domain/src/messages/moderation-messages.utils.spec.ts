import { describe, expect, it } from "vitest";
import { buildRetirementMessage } from "./moderation-messages.utils.js";

describe("buildRetirementMessage", () => {
    it("nomme le produit et porte le motif, en français", () => {
        const message = buildRetirementMessage("Sac cabas", "Contrefaçon", "fr");

        expect(message.subject).toContain("Sac cabas");
        expect(message.text).toContain("Contrefaçon");
        // Le destinataire est laissé VIDE : c'est l'appelant qui le connaît, et le lui
        // faire passer ici propagerait une donnée que le texte n'utilise pas.
        expect(message.recipient).toBe("");
    });

    it("bascule en anglais", () => {
        const message = buildRetirementMessage("Tote bag", "Counterfeit", "en");
        expect(message.subject).not.toContain("retiré");
        expect(message.text).toContain("Counterfeit");
    });

    // Une locale inconnue retombe sur le français, langue par défaut de l'interface. Un
    // vendeur sans candidature n'en a aucune, cas que la tâche 3 rencontre.
    it("retombe sur le français pour une locale inconnue", () => {
        const inconnue = buildRetirementMessage("Sac", "Motif", "de");
        const francais = buildRetirementMessage("Sac", "Motif", "fr");
        expect(inconnue.subject).toBe(francais.subject);
    });
});
