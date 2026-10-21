import { shopRoom, userRoom } from "./realtime-rooms.utils";

describe("les salles", () => {
    it("nomme la salle d'un compte par son identifiant", () => {
        expect(userRoom("user-1")).toBe("user:user-1");
    });

    it("nomme la salle d'une boutique par son identifiant", () => {
        expect(shopRoom("vendor-1")).toBe("shop:vendor-1");
    });

    // Le préfixe sépare les deux espaces de noms : un compte et une boutique qui
    // porteraient le même identifiant ne partagent pas de salle.
    it("ne confond jamais un compte et une boutique de même identifiant", () => {
        expect(userRoom("same-id")).not.toBe(shopRoom("same-id"));
    });
});
