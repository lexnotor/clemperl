import { describe, expect, it } from "vitest";
import { buildRetirementMessage } from "./moderation-messages.utils.js";

describe("buildRetirementMessage", () => {
    it("nomme le produit et porte le motif, en français", () => {
        const message = buildRetirementMessage("Sac cabas", "COUNTERFEIT", "", "fr");

        expect(message.subject).toContain("Sac cabas");
        expect(message.text).toContain("Contrefaçon");
        // Le destinataire est laissé VIDE : c'est l'appelant qui le connaît, et le lui
        // faire passer ici propagerait une donnée que le texte n'utilise pas.
        expect(message.recipient).toBe("");
    });

    it("bascule en anglais", () => {
        const message = buildRetirementMessage("Tote bag", "COUNTERFEIT", "", "en");
        expect(message.subject).not.toContain("retiré");
        expect(message.text).toContain("Counterfeit");
    });

    // Une locale inconnue retombe sur le français, langue par défaut de l'interface. Un
    // vendeur sans candidature n'en a aucune, cas que la tâche 3 rencontre.
    it("retombe sur le français pour une locale inconnue", () => {
        const inconnue = buildRetirementMessage("Sac", "COUNTERFEIT", "", "de");
        const francais = buildRetirementMessage("Sac", "COUNTERFEIT", "", "fr");
        expect(inconnue.subject).toBe(francais.subject);
    });
});

describe("le motif voyage dans la langue du VENDEUR", () => {
    // Le libellé du motif vient du catalogue de l'administration, qui n'existe qu'en
    // français. Le prendre là ferait recevoir à un vendeur anglophone un message anglais
    // portant un motif français : la seule information qui rend l'avertissement actionnable
    // serait dans la langue qu'on a justement déterminé qu'il ne lit pas.
    it("traduit le motif, pas seulement le corps du message", () => {
        const anglais = buildRetirementMessage("Tote bag", "COUNTERFEIT", "", "en");
        const francais = buildRetirementMessage("Sac cabas", "COUNTERFEIT", "", "fr");

        expect(anglais.text).toContain("Counterfeit");
        expect(anglais.text).not.toContain("Contrefaçon");
        expect(francais.text).toContain("Contrefaçon");
    });

    // Les précisions sont la phrase qu'un administrateur écrit lui-même : elles partent
    // telles quelles, dans sa langue à lui, et c'est assumé. Les traduire demanderait de
    // traduire une saisie libre.
    it("ajoute les précisions sous le libellé", () => {
        const message = buildRetirementMessage(
            "Sac",
            "MISLEADING_CONTENT",
            "La photo montre un autre modèle.",
            "fr",
        );

        expect(message.text).toContain("Description ou photo trompeuse");
        expect(message.text).toContain("La photo montre un autre modèle.");
    });

    // « Autre » ne dit rien par lui-même : seules les précisions parlent, et le libellé
    // générique au-dessus n'ajouterait que du bruit.
    it("ne garde que les précisions quand le motif est « autre »", () => {
        const message = buildRetirementMessage("Sac", "OTHER", "Le titre insulte.", "fr");

        expect(message.text).toContain("Le titre insulte.");
        expect(message.text).not.toContain("Autre");
    });

    // Un motif hors vocabulaire ne doit pas produire un message vide : le dépôt le refuse
    // en amont, mais ce constructeur est pur et ne compte pas sur son appelant.
    it("retombe sur le code brut pour un motif inconnu", () => {
        const message = buildRetirementMessage("Sac", "INVENTE", "", "fr");
        expect(message.text).toContain("INVENTE");
    });
});
