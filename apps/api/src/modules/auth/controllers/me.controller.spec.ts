import { MeController } from "./me.controller";

describe("MeController", () => {
    it("renvoie l'identifiant et l'adresse de la session attachée", () => {
        const controller = new MeController();

        // La session est posée sur la requête par le garde : le contrôleur la lit
        // sans redemander à la base ce qui vient d'être vérifié.
        const result = controller.read({
            session: { user: { id: "u1", email: "client@exemple.test" } },
        });

        expect(result).toEqual({ id: "u1", email: "client@exemple.test" });
    });

    it("n'expose que l'identifiant et l'adresse, rien d'autre de la session", () => {
        const controller = new MeController();

        const result = controller.read({
            session: {
                user: {
                    id: "u1",
                    email: "client@exemple.test",
                    // Une session porte davantage que ce qu'on veut renvoyer. Ce test
                    // échoue si quelqu'un remplace le retour par `request.session.user`.
                    motDePasseHache: "ne-doit-jamais-sortir",
                } as { id: string; email: string },
            },
        });

        expect(Object.keys(result).sort()).toEqual(["email", "id"]);
    });
});
