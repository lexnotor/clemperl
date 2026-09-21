import { prisma } from "@clemperl/db";

// Les trois garanties de cette tranche sont des CONTRAINTES DE BASE, pas des
// vérifications de code. Un client simulé renverrait ce qu'on lui a dit de renvoyer :
// seul un vrai PostgreSQL refuse.
const PREFIX = "schema-product";
let counter = 0;

async function createShopWithProduct(): Promise<{ vendorId: string; productId: string }> {
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
            description: "Cuir pleine fleur, coutures à la main.",
        },
    });
    return { vendorId: vendor.id, productId: product.id };
}

describe("contraintes du catalogue", () => {
    it("refuse deux variantes de même combinaison", async () => {
        const { productId } = await createShopWithProduct();
        await prisma.productVariant.create({
            data: { productId, priceAmount: 12000, combinationKey: "a|b", position: 0 },
        });

        await expect(
            prisma.productVariant.create({
                data: { productId, priceAmount: 9900, combinationKey: "a|b", position: 1 },
            }),
        ).rejects.toThrow();
    });

    // La clé vide est le cas « aucun axe ». L'unicité y devient « exactement une
    // variante », sans qu'aucun code n'ait à le vérifier.
    it("refuse une deuxième variante sans axe", async () => {
        const { productId } = await createShopWithProduct();
        await prisma.productVariant.create({
            data: { productId, priceAmount: 12000, combinationKey: "", position: 0 },
        });

        await expect(
            prisma.productVariant.create({
                data: { productId, priceAmount: 9900, combinationKey: "", position: 1 },
            }),
        ).rejects.toThrow();
    });

    it("refuse qu'une variante porte deux valeurs du même axe", async () => {
        const { productId } = await createShopWithProduct();
        const option = await prisma.productOption.create({
            data: { productId, name: "Taille", position: 0 },
        });
        const small = await prisma.productOptionValue.create({
            data: { optionId: option.id, label: "S", position: 0 },
        });
        const medium = await prisma.productOptionValue.create({
            data: { optionId: option.id, label: "M", position: 1 },
        });
        const variant = await prisma.productVariant.create({
            data: { productId, priceAmount: 12000, combinationKey: small.id, position: 0 },
        });

        await prisma.productVariantValue.create({
            data: { variantId: variant.id, optionId: option.id, optionValueId: small.id },
        });

        await expect(
            prisma.productVariantValue.create({
                data: { variantId: variant.id, optionId: option.id, optionValueId: medium.id },
            }),
        ).rejects.toThrow();
    });

    // Deux vendeurs ont le droit de vendre chacun leur « sac-cabas ». L'unicité du slug
    // est par boutique, jamais globale — sinon le premier arrivé confisquerait le nom.
    it("autorise le même slug dans deux boutiques", async () => {
        const first = await createShopWithProduct();
        const second = await createShopWithProduct();
        const slug = `${PREFIX}-partage-${counter}`;

        await prisma.product.update({ where: { id: first.productId }, data: { slug } });
        await expect(
            prisma.product.update({ where: { id: second.productId }, data: { slug } }),
        ).resolves.toBeDefined();
    });

    // Fermer une boutique emporte son catalogue : un produit sans boutique n'est
    // joignable par personne et ne ferait qu'occuper de la place.
    it("emporte le catalogue quand la boutique disparaît", async () => {
        const { vendorId, productId } = await createShopWithProduct();
        await prisma.vendor.delete({ where: { id: vendorId } });

        expect(await prisma.product.findUnique({ where: { id: productId } })).toBeNull();
    });
});
