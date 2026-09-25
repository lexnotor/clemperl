import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { IMAGE_FAILURE } from "@clemperl/domain";
import { PRODUCT_IMAGE_CONCURRENCY, PRODUCT_IMAGE_QUEUE } from "../media.constants";
import { ImageDerivativesService, orientedSize, rejectionFor } from "./image-derivatives.service";

// Orientation 6 : « tournée d'un quart de tour dans le sens horaire ». C'est ce qu'écrit
// un téléphone tenu en portrait — le capteur enregistre toujours en paysage et note la
// rotation à part. La majorité des photos de vendeurs arrivent ainsi.
async function photoPortrait(largeur: number, hauteur: number): Promise<Buffer> {
    const paysage = await sharp({
        create: { width: largeur, height: hauteur, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
        .jpeg()
        .toBuffer();
    return sharp(paysage).withMetadata({ orientation: 6 }).jpeg().toBuffer();
}

const FIXTURES = join(__dirname, "../../../../test/fixtures");

describe("ImageDerivativesService", () => {
    const service = new ImageDerivativesService();

    it("rend une déclinaison par largeur, en WebP", async () => {
        const original = await readFile(join(FIXTURES, "photo.jpg"));
        const result = await service.derive(original);

        expect(result.width).toBe(1200);
        expect(result.height).toBe(800);
        expect(result.derivatives.map((d) => d.width)).toEqual([320, 800, 1600]);

        // Les octets d'un WebP commencent par « RIFF…WEBP ». Vérifier le format PRODUIT
        // et non la seule absence d'erreur : un buffer vide passerait aussi.
        for (const derivative of result.derivatives) {
            expect(derivative.content.subarray(0, 4).toString()).toBe("RIFF");
            expect(derivative.content.subarray(8, 12).toString()).toBe("WEBP");
        }
    });

    // Une image de 900 px ne doit pas devenir un 1600 px flou et deux fois plus lourd
    // que son original.
    it("n'agrandit jamais au-delà de l'original", async () => {
        const original = await readFile(join(FIXTURES, "photo.jpg"));
        const result = await service.derive(original);
        const grande = result.derivatives.find((d) => d.width === 1600);
        const moyenne = result.derivatives.find((d) => d.width === 800);

        // L'original fait 1200 px : la déclinaison 1600 est donc bornée à 1200, et pèse
        // plus que la 800 sans jamais valoir un agrandissement.
        expect(grande?.content.length).toBeGreaterThan(moyenne?.content.length ?? 0);
    });

    // sharp rend les dimensions AVANT rotation, et `.resize()` ne redresse pas tout seul.
    // Sans `.rotate()`, une photo prise en portrait est servie couchée — et les `width` /
    // `height` rangés en base décrivent l'inverse de ce que la boutique affiche.
    it("redresse une photo selon son orientation EXIF", async () => {
        const portrait = await photoPortrait(1200, 800);
        const result = await service.derive(portrait);

        expect(result.width).toBe(800);
        expect(result.height).toBe(1200);

        const vignette = await sharp(
            result.derivatives.find((d) => d.width === 320)?.content as Buffer,
        ).metadata();
        expect(vignette.width).toBe(320);
        expect(vignette.height).toBe(480);
    });

    // Le refus se juge sur les dimensions REDRESSÉES. Jugé sur les dimensions rangées,
    // ce fichier passerait pour large de 5000 px alors qu'il est large de 200.
    it("juge l'étroitesse sur les dimensions redressées", async () => {
        const couchee = await photoPortrait(5000, 200);
        await expect(service.derive(couchee)).rejects.toThrow(IMAGE_FAILURE.tooSmall);
    });

    it("refuse ce qui n'est pas une image", async () => {
        const junk = await readFile(join(FIXTURES, "not-an-image.txt"));
        await expect(service.derive(junk)).rejects.toThrow(IMAGE_FAILURE.unreadable);
    });

    // 8000 × 8000 tient en 75 Ko sur le disque et passe donc le plafond de taille du
    // stockage. C'est la DÉCOMPRESSION qui coûterait des gigaoctets, et le worker
    // partageant son conteneur avec l'API, l'OOM emporterait les deux.
    //
    // La limite doit agir sur les MÉTADONNÉES, avant toute tentative de décodage : c'est
    // ce qui distingue un refus d'un processus tué.
    it("refuse une image dont les dimensions dépassent la limite, sans la décoder", async () => {
        const bomb = await readFile(join(FIXTURES, "pixel-bomb.png"));
        await expect(service.derive(bomb)).rejects.toThrow(IMAGE_FAILURE.tooLarge);
    });

    it("refuse une image trop petite pour la plus petite largeur", async () => {
        const tiny = await readFile(join(FIXTURES, "tiny.png"));
        await expect(service.derive(tiny)).rejects.toThrow(IMAGE_FAILURE.tooSmall);
    });
});

describe("la borne de concurrence", () => {
    // Un critère qui dirait « l'API ne devient pas muette » ne se vérifierait pas. Ce qui
    // se vérifie, c'est que la borne est déclarée en un seul endroit et qu'elle vaut ce
    // qu'on a décidé.
    it("est déclarée et basse", () => {
        expect(PRODUCT_IMAGE_CONCURRENCY).toBeLessThanOrEqual(2);
        expect(PRODUCT_IMAGE_CONCURRENCY).toBeGreaterThan(0);
    });
});

// La décision est pure : elle se teste exhaustivement, sans fabriquer un fichier par cas.
describe("rejectionFor", () => {
    it("laisse passer une image ordinaire", () => {
        expect(rejectionFor(1200, 800)).toBeNull();
    });

    // sharp lève pour un fichier illisible, mais certains formats se parsent sans porter
    // de taille : sans cette garde, `width * height` vaudrait zéro et l'image passerait.
    it("refuse des dimensions inconnues", () => {
        expect(rejectionFor(0, 800)).toBe(IMAGE_FAILURE.unreadable);
        expect(rejectionFor(1200, 0)).toBe(IMAGE_FAILURE.unreadable);
    });

    // sharp rend `undefined` pour un format qu'il parse sans y lire de taille. Sans ce
    // cas, `width * height` vaudrait `NaN` et toutes les comparaisons seraient fausses :
    // l'image passerait toutes les gardes.
    it("refuse des dimensions absentes", () => {
        expect(rejectionFor(undefined, 800)).toBe(IMAGE_FAILURE.unreadable);
        expect(rejectionFor(1200, undefined)).toBe(IMAGE_FAILURE.unreadable);
        expect(rejectionFor(undefined, undefined)).toBe(IMAGE_FAILURE.unreadable);
    });

    it("refuse au-delà de la limite de pixels", () => {
        expect(rejectionFor(8000, 8000)).toBe(IMAGE_FAILURE.tooLarge);
    });

    it("refuse plus étroit que la plus petite déclinaison", () => {
        expect(rejectionFor(319, 5000)).toBe(IMAGE_FAILURE.tooSmall);
    });

    // La limite est vérifiée AVANT l'étroitesse : une image de 100 × 600000 est d'abord
    // démesurée, et le dire « trop petite » égarerait le vendeur.
    it("annonce la démesure avant l'étroitesse", () => {
        expect(rejectionFor(100, 600_000)).toBe(IMAGE_FAILURE.tooLarge);
    });

    it("accepte exactement la plus petite largeur", () => {
        expect(rejectionFor(320, 320)).toBeNull();
    });
});

// La permutation est pure : les huit valeurs se testent sans fabriquer huit fichiers.
describe("orientedSize", () => {
    it("laisse une image sans orientation telle quelle", () => {
        expect(orientedSize(1200, 800, undefined)).toEqual({ width: 1200, height: 800 });
        expect(orientedSize(1200, 800, 1)).toEqual({ width: 1200, height: 800 });
    });

    // 5 à 8 sont les quatre orientations qui comportent un quart de tour ; 2, 3 et 4 sont
    // des miroirs et un demi-tour, qui ne permutent rien.
    it("permute pour les quatre orientations qui tournent d'un quart de tour", () => {
        for (const orientation of [5, 6, 7, 8]) {
            expect(orientedSize(1200, 800, orientation)).toEqual({ width: 800, height: 1200 });
        }
        for (const orientation of [2, 3, 4]) {
            expect(orientedSize(1200, 800, orientation)).toEqual({ width: 1200, height: 800 });
        }
    });

    // Une valeur hors plage ne doit pas permuter : sharp ne redresserait pas non plus, et
    // permuter ici ferait mentir la base.
    // sharp rend `undefined` pour un format qu'il parse sans y lire de taille. La
    // permutation laisse passer l'absence telle quelle : c'est `rejectionFor` qui tranche.
    it("laisse passer des dimensions absentes", () => {
        expect(orientedSize(undefined, undefined, 6)).toEqual({
            width: undefined,
            height: undefined,
        });
    });

    it("ignore une orientation hors plage", () => {
        expect(orientedSize(1200, 800, 9)).toEqual({ width: 1200, height: 800 });
        expect(orientedSize(1200, 800, 0)).toEqual({ width: 1200, height: 800 });
    });
});

describe("le nom de la file", () => {
    // Le producteur vit dans `apps/vendor` et le consommateur ici : deux paquets qui ne
    // partagent aucun import. Ce nom est leur seul contrat, et une faute de frappe d'un
    // côté produirait une file où personne ne consomme, sans erreur nulle part.
    it("est celui que le producteur empile", () => {
        expect(PRODUCT_IMAGE_QUEUE).toBe("product-images");
    });
});
