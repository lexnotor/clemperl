import { describe, expect, it } from "vitest";
import { documentResponse } from "./document-response.utils.js";

describe("servir une pièce privée", () => {
    it("rend le contenu avec le type stocké, sans cache et sans deviner le type", async () => {
        const response = documentResponse(new Blob(["%PDF"]), {
            mimeType: "application/pdf",
            originalName: "bon.pdf",
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("%PDF");
        expect(response.headers.get("Content-Type")).toBe("application/pdf");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    });

    // Le nom vient de l'utilisateur et finit dans un en-tête : un guillemet ou un retour à
    // la ligne y casserait l'en-tête, ou en injecterait un autre.
    it("assainit le nom d'origine avant de le mettre dans l'en-tête", () => {
        const response = documentResponse(new Blob(["x"]), {
            mimeType: "image/jpeg",
            originalName: 'colis "abîmé"\r\n.jpg',
        });

        expect(response.headers.get("Content-Disposition")).toBe(
            'inline; filename="colis__ab_m____.jpg"',
        );
    });
});
