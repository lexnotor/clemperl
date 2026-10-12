import { escapeHtml } from "./html.utils";

describe("escapeHtml", () => {
    it("neutralise les cinq caractères qui ouvrent une balise ou un attribut", () => {
        expect(escapeHtml(`<script>alert("x" + 'y' + a&b)</script>`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot; + &#39;y&#39; + a&amp;b)&lt;/script&gt;",
        );
    });

    it("laisse intact un texte sans caractère spécial", () => {
        expect(escapeHtml("CP-2026-0042 : réglé")).toBe("CP-2026-0042 : réglé");
    });

    // Un `&` déjà échappé ne doit pas rester tel quel : sinon `&lt;` saisi par l'attaquant
    // s'afficherait `<`, et l'échappement serait défait par le navigateur.
    it("échappe l'esperluette d'une entité déjà écrite", () => {
        expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    });
});
