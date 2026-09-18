import { MoiController } from "./moi.controller";

describe("MoiController", () => {
    it("renvoie l'identifiant et l'adresse de la session attachée", () => {
        const controller = new MoiController();

        // La session est posée sur la requête par le garde : le contrôleur la lit
        // sans redemander à la base ce qui vient d'être vérifié.
        const resultat = controller.lire({
            session: { user: { id: "u1", email: "client@exemple.test" } },
        });

        expect(resultat).toEqual({ id: "u1", email: "client@exemple.test" });
    });

    it("n'expose que l'identifiant et l'adresse, rien d'autre de la session", () => {
        const controller = new MoiController();

        const resultat = controller.lire({
            session: {
                user: {
                    id: "u1",
                    email: "client@exemple.test",
                    // Une session porte davantage que ce qu'on veut renvoyer. Ce test
                    // échoue si quelqu'un remplace le retour par `requete.session.user`.
                    motDePasseHache: "ne-doit-jamais-sortir",
                } as { id: string; email: string },
            },
        });

        expect(Object.keys(resultat).sort()).toEqual(["email", "id"]);
    });
});
