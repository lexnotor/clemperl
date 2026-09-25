import { uploadMedia } from "@clemperl/core";
import { buildOriginalPath, derivativePath, isServableMediaPath } from "@clemperl/domain";

// Cette suite vit ici parce que la couche intégration a le stockage sous la main. Elle
// vise le nom de service du réseau Docker et NON `NEXT_PUBLIC_STOREFRONT_URL` : cette
// variable décrit l'origine vue du navigateur, pas celle vue d'un conteneur frère, où
// `localhost` désignerait le conteneur lui-même.
const STOREFRONT = "http://storefront:3000";
const PRODUCT = "c1zqk8s0000008l3h2f4g5j6";

describe("la route de relais", () => {
    it("sert une déclinaison déposée, avec un cache immuable", async () => {
        const original = buildOriginalPath(PRODUCT, "photo.jpg");
        const path = derivativePath(original, 320);
        await uploadMedia(path, new TextEncoder().encode("RIFF0000WEBPxx").buffer as ArrayBuffer, "image/webp");

        const response = await fetch(`${STOREFRONT}/api/media/${path}`);

        expect(response.status).toBe(200);
        // Les chemins ne changent jamais : le cache long est ce qui fait que le relais
        // coûte le premier accès et pas les suivants.
        expect(response.headers.get("cache-control")).toContain("immutable");
        expect(response.headers.get("cache-control")).toContain("max-age=31536000");

        // Le navigateur ne doit pas renifler le contenu pour se faire une opinion du
        // type : c'est ainsi qu'un octet bien choisi se fait exécuter sous un type
        // inoffensif.
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });

    // LA barrière qui compte. Le stockage rend l'original tel qu'il a été déposé, avec le
    // type que le navigateur du vendeur avait déclaré. Un SVG porte du script, sharp le
    // décline sans se plaindre — donc l'image passait READY et l'original SURVIVAIT —, et
    // le servir depuis l'origine de la boutique exécutait ce script là où vit le cookie
    // de session partagé depuis T1a.
    it("répond 404 à un original, quel que soit son format", async () => {
        const original = buildOriginalPath(PRODUCT, "photo.svg");
        await uploadMedia(
            original,
            new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
                .buffer as ArrayBuffer,
            "image/svg+xml",
        );

        const response = await fetch(`${STOREFRONT}/api/media/${original}`);

        expect(response.status).toBe(404);
    });

    it("répond 404 à un original ordinaire aussi", async () => {
        const original = buildOriginalPath(PRODUCT, "photo.jpg");
        await uploadMedia(original, new TextEncoder().encode("xx").buffer as ArrayBuffer, "image/jpeg");

        expect((await fetch(`${STOREFRONT}/api/media/${original}`)).status).toBe(404);
    });

    it("répond 404 à un chemin de justificatif", async () => {
        const response = await fetch(`${STOREFRONT}/api/media/applications/abc/identity-1.pdf`);
        expect(response.status).toBe(404);
    });

    it("répond 404 à une largeur qu'on ne produit pas", async () => {
        const original = buildOriginalPath(PRODUCT, "photo.jpg");
        const response = await fetch(`${STOREFRONT}/api/media/${derivativePath(original, 999)}`);
        expect(response.status).toBe(404);
    });

    it("répond 404 à un chemin bien formé dont l'objet n'existe pas", async () => {
        const original = buildOriginalPath(PRODUCT, "fantome.jpg");
        const response = await fetch(`${STOREFRONT}/api/media/${derivativePath(original, 320)}`);
        expect(response.status).toBe(404);
    });

    // Deux barrières INDÉPENDANTES : le motif refuse, et le bucket distinct rendrait la
    // lecture impossible même s'il acceptait.
    it("ne peut désigner aucun justificatif, ni par le motif ni par le bucket", () => {
        expect(isServableMediaPath("applications/abc/identity-1.pdf")).toBe(false);
        expect(isServableMediaPath(`../../vendor-documents/${PRODUCT}/x/w320.webp`)).toBe(false);
    });
});
