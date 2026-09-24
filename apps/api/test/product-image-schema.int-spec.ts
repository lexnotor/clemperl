import { prisma } from "@clemperl/db";

// Ce que cette suite éprouve sont des CONTRAINTES DE BASE, pas des vérifications de
// code : un substitut renverrait ce qu'on lui a dit de renvoyer, seul un vrai PostgreSQL
// refuse.
//
// Le préfixe est propre au fichier : les suites partagent une base et un run, et deux
// qui nomment leurs boutiques pareil se percutent — la panne s'affichant alors dans la
// suite VOISINE.
const PREFIX = "image-schema";
let counter = 0;

async function createProduct(): Promise<string> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    const product = await prisma.product.create({
        data: {
            vendorId: vendor.id,
            slug: `${PREFIX}-cabas-${counter}`,
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        },
    });
    return product.id;
}

describe("contraintes des images", () => {
    it("refuse deux images à la même position", async () => {
        const productId = await createProduct();
        await prisma.productImage.create({
            data: { productId, objectPath: "a/1/original.jpg", position: 0, originalName: "a.jpg" },
        });

        await expect(
            prisma.productImage.create({
                data: {
                    productId,
                    objectPath: "a/2/original.jpg",
                    position: 0,
                    originalName: "b.jpg",
                },
            }),
        ).rejects.toThrow();
    });

    it("naît en attente, sans dimensions connues", async () => {
        const productId = await createProduct();
        const image = await prisma.productImage.create({
            data: { productId, objectPath: "a/1/original.jpg", position: 0, originalName: "a.jpg" },
        });

        expect(image.status).toBe("PENDING");
        expect(image.width).toBeNull();
        expect(image.failureReason).toBeNull();
    });

    // Supprimer un produit emporte ses images : une image sans produit n'est joignable
    // par personne et ne ferait qu'occuper de la place.
    it("emporte les images quand le produit disparaît", async () => {
        const productId = await createProduct();
        const image = await prisma.productImage.create({
            data: { productId, objectPath: "a/1/original.jpg", position: 0, originalName: "a.jpg" },
        });

        await prisma.product.delete({ where: { id: productId } });

        expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
    });

    // Deux produits différents ont chacun leur position 0 : l'unicité porte sur le
    // couple, pas sur la position seule.
    it("autorise la même position dans deux produits", async () => {
        const first = await createProduct();
        const second = await createProduct();

        await prisma.productImage.create({
            data: {
                productId: first,
                objectPath: "a/1/original.jpg",
                position: 0,
                originalName: "a.jpg",
            },
        });

        await expect(
            prisma.productImage.create({
                data: {
                    productId: second,
                    objectPath: "b/1/original.jpg",
                    position: 0,
                    originalName: "b.jpg",
                },
            }),
        ).resolves.toBeDefined();
    });
});
