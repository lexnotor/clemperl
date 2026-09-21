import { prisma, readVendorForMember, updateShopProfile } from "@clemperl/db";

// Ce que ces fonctions garantissent — qu'un champ légal et le slug ne bougent PAS — est
// une propriété de la base, pas du code appelant. Un client simulé renverrait ce qu'on
// lui a dit de renvoyer.
let counter = 0;

async function createShopWithOwner(): Promise<{ vendorId: string; userId: string; slug: string }> {
    counter += 1;
    const user = await prisma.user.create({
        data: {
            email: `owner-${counter}@clemperl.test`,
            name: "Propriétaire",
            emailVerified: true,
        },
    });
    const vendor = await prisma.vendor.create({
        data: {
            slug: `atelier-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            members: { create: { userId: user.id, role: "OWNER" } },
        },
    });
    return { vendorId: vendor.id, userId: user.id, slug: vendor.slug };
}

describe("readVendorForMember", () => {
    it("retrouve la boutique dont le compte est membre", async () => {
        const { vendorId, userId } = await createShopWithOwner();
        expect((await readVendorForMember(prisma, userId))?.id).toBe(vendorId);
    });

    it("ne renvoie rien pour un compte sans appartenance", async () => {
        counter += 1;
        const stranger = await prisma.user.create({
            data: { email: `stranger-${counter}@clemperl.test`, name: "Passant" },
        });
        expect(await readVendorForMember(prisma, stranger.id)).toBeNull();
    });

    // Une boutique fermée n'est pas une boutique qu'on administre. Sans ce filtre, un
    // ancien vendeur garderait un espace fonctionnel.
    it("ignore une boutique supprimée", async () => {
        const { vendorId, userId } = await createShopWithOwner();
        await prisma.vendor.update({ where: { id: vendorId }, data: { deletedAt: new Date() } });
        expect(await readVendorForMember(prisma, userId)).toBeNull();
    });
});

describe("updateShopProfile", () => {
    it("enregistre les champs commerciaux", async () => {
        const { vendorId, userId } = await createShopWithOwner();
        await updateShopProfile(prisma, {
            vendorId,
            shopName: "Lumière & Cie",
            shopDescription: "Joaillerie contemporaine, série limitée et sur mesure.",
            contactEmail: "bonjour@lumiere.test",
            contactPhone: "+32470111111",
            categories: ["JEWELLERY", "LEATHER_GOODS"],
        });

        const after = await readVendorForMember(prisma, userId);
        expect(after?.shopName).toBe("Lumière & Cie");
        expect(after?.categories).toEqual(["JEWELLERY", "LEATHER_GOODS"]);
    });

    // Le cœur de la tranche : le slug part dans les URL publiques en T2d, et le légal a
    // été validé contre des pièces. Renommer ne doit toucher ni l'un ni l'autre.
    it("ne touche ni au slug ni aux informations légales", async () => {
        const { vendorId, userId, slug } = await createShopWithOwner();
        await updateShopProfile(prisma, {
            vendorId,
            shopName: "Lumière & Cie",
            shopDescription: "Joaillerie contemporaine, série limitée et sur mesure.",
            contactEmail: "bonjour@lumiere.test",
            contactPhone: "+32470111111",
            categories: ["JEWELLERY"],
        });

        const after = await readVendorForMember(prisma, userId);
        expect(after?.slug).toBe(slug);
        expect(after?.legalName).toBe("Atelier Lumière SRL");
        expect(after?.registrationNumber).toBe("0123456789");
    });
});
