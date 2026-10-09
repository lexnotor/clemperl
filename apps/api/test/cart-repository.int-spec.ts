import {
    CART_REJECTION,
    ERROR_CART_CURRENCY_MISMATCH,
    ERROR_CART_ITEM_INELIGIBLE,
    addCartItem,
    createProduct,
    mergeLocalCart,
    prisma,
    readCart,
    setCartItemQuantity,
    setProductStatus,
} from "@clemperl/db";

const PREFIX = "cart";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

async function createUser(): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
        data: {
            email: `${PREFIX}-${counter}@acheteur.test`,
            name: "Acheteuse",
            emailVerified: true,
        },
    });
    return user.id;
}

async function createShop(currency: string) {
    counter += 1;
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: `Atelier ${counter}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${counter}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${counter} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: currency as never,
        },
    });
}

// Un produit PUBLIÉ complet, avec sa variante et son image prête. Sans l'image le dépôt
// refuse la publication, garantie solidifiée en T2c, et sans elle le panier le refuserait
// aussi.
async function publishedVariant(vendorId: string, currency: string, amount: number) {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: amount,
        expectedCurrency: currency,
    });
    await prisma.productImage.create({
        data: {
            productId: id,
            objectPath: `${id}/1111111${counter % 10}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId: id, vendorId, publish: true });
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id } });
    return { productId: id, variantId: variant.id };
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("addCartItem", () => {
    it("crée le panier au premier article et pose sa devise", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 18000);

        await addCartItem(prisma, { userId, variantId, quantity: 2 });

        const panier = await readCart(prisma, userId);
        expect(panier?.currency).toBe("EUR");
        expect(panier?.lines).toHaveLength(1);
        expect(panier?.lines[0]?.quantity).toBe(2);
        expect(panier?.lines[0]?.unitAmount).toBe(18000);
    });

    // Un article, UNE ligne : l'index unique le garantit, et le dépôt incrémente plutôt
    // que de laisser la base refuser.
    it("incrémente la quantité au second ajout du même article", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);

        await addCartItem(prisma, { userId, variantId, quantity: 1 });
        await addCartItem(prisma, { userId, variantId, quantity: 2 });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(1);
        expect(panier?.lines[0]?.quantity).toBe(3);
    });

    it("refuse une seconde devise", async () => {
        const userId = await createUser();
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        const premier = await publishedVariant(euro.id, "EUR", 5000);
        const second = await publishedVariant(cfa.id, "XOF", 30000);

        await addCartItem(prisma, { userId, variantId: premier.variantId, quantity: 1 });

        await expect(
            addCartItem(prisma, { userId, variantId: second.variantId, quantity: 1 }),
        ).rejects.toMatchObject({ message: ERROR_CART_CURRENCY_MISMATCH });
    });

    // Un double-clic sur « Ajouter au panier » quand le panier n'existe pas encore : les
    // transactions tentent toutes de créer le panier, et sans reprise les perdantes
    // remontent un P2002 brut jusqu'à l'écran. Huit ajouts et non deux : à deux, la course
    // ne se produisait qu'une fois sur cinq. La quantité finale prouve qu'aucun ajout n'a
    // été perdu en route par la reprise.
    it("encaisse huit premiers ajouts simultanés sans en perdre un", async () => {
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);

        // Dix comptes neufs l'un après l'autre : une seule manche ne déclenche la course
        // que par intermittence, dix la rendent presque certaine.
        for (let manche = 0; manche < 10; manche += 1) {
            const userId = await createUser();

            const resultats = await Promise.allSettled(
                Array.from({ length: 8 }, () =>
                    addCartItem(prisma, { userId, variantId, quantity: 1 }),
                ),
            );

            expect(resultats.filter((r) => r.status === "rejected")).toHaveLength(0);
            const panier = await readCart(prisma, userId);
            expect(panier?.lines).toHaveLength(1);
            expect(panier?.lines[0]?.quantity).toBe(8);
        }
    });

    // L'autre course : le panier existe, mais l'article est NOUVEAU. Prisma émule `upsert`
    // par une lecture puis une écriture, donc deux ajouts simultanés peuvent tous deux ne
    // rien trouver puis se heurter sur l'index unique (panier, article).
    it("encaisse deux ajouts simultanés d'un même nouvel article sur un panier existant", async () => {
        const shop = await createShop("EUR");
        const deja = await publishedVariant(shop.id, "EUR", 5000);
        const nouveau = await publishedVariant(shop.id, "EUR", 7000);

        // Plusieurs manches, pour la même raison que ci-dessus.
        for (let manche = 0; manche < 10; manche += 1) {
            const userId = await createUser();
            await addCartItem(prisma, { userId, variantId: deja.variantId, quantity: 1 });

            const resultats = await Promise.allSettled([
                addCartItem(prisma, { userId, variantId: nouveau.variantId, quantity: 1 }),
                addCartItem(prisma, { userId, variantId: nouveau.variantId, quantity: 1 }),
            ]);

            expect(resultats.filter((r) => r.status === "rejected")).toHaveLength(0);
            const panier = await readCart(prisma, userId);
            const ligne = panier?.lines.find((l) => l.variantId === nouveau.variantId);
            expect(ligne?.quantity).toBe(2);
        }
    });

    // Cinq tests et non un : un seul montage qui casserait plusieurs conditions à la fois
    // prouverait seulement que le prédicat refuse QUELQUE CHOSE, pas laquelle des
    // conditions a fait le travail. Chacun part d'un produit entièrement valide et en
    // défait exactement une. La tâche de la commande réutilise ce prédicat et dépend de
    // chacune.
    //
    // Le message est comparé en ENTIER (`toMatchObject`), pas par sous-chaîne : l'erreur de
    // validation de Prisma recopie le code source fautif, donc le nom de la constante, et
    // une sous-chaîne l'accepterait pour une tout autre panne.
    describe("éligibilité", () => {
        async function eligibleForCart() {
            const userId = await createUser();
            const shop = await createShop("EUR");
            const { productId, variantId } = await publishedVariant(shop.id, "EUR", 5000);
            return { userId, shop, productId, variantId };
        }

        it("refuse un produit dépublié", async () => {
            const { userId, shop, productId, variantId } = await eligibleForCart();
            await setProductStatus(prisma, { productId, vendorId: shop.id, publish: false });

            await expect(
                addCartItem(prisma, { userId, variantId, quantity: 1 }),
            ).rejects.toMatchObject({ message: ERROR_CART_ITEM_INELIGIBLE });
        });

        it("refuse un produit supprimé", async () => {
            const { userId, productId, variantId } = await eligibleForCart();
            await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });

            await expect(
                addCartItem(prisma, { userId, variantId, quantity: 1 }),
            ).rejects.toMatchObject({ message: ERROR_CART_ITEM_INELIGIBLE });
        });

        it("refuse une boutique fermée", async () => {
            const { userId, shop, variantId } = await eligibleForCart();
            await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

            await expect(
                addCartItem(prisma, { userId, variantId, quantity: 1 }),
            ).rejects.toMatchObject({ message: ERROR_CART_ITEM_INELIGIBLE });
        });

        it("refuse une boutique sans devise", async () => {
            const { userId, shop, variantId } = await eligibleForCart();
            await prisma.vendor.update({ where: { id: shop.id }, data: { currency: null } });

            await expect(
                addCartItem(prisma, { userId, variantId, quantity: 1 }),
            ).rejects.toMatchObject({ message: ERROR_CART_ITEM_INELIGIBLE });
        });

        it("refuse un produit sans image prête", async () => {
            const { userId, productId, variantId } = await eligibleForCart();
            await prisma.productImage.updateMany({
                where: { productId },
                data: { status: "PENDING" },
            });

            await expect(
                addCartItem(prisma, { userId, variantId, quantity: 1 }),
            ).rejects.toMatchObject({ message: ERROR_CART_ITEM_INELIGIBLE });
        });
    });
});

describe("setCartItemQuantity", () => {
    it("retire la ligne quand la quantité tombe à zéro", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId, quantity: 2 });

        await setCartItemQuantity(prisma, { userId, variantId, quantity: 0 });

        // Le panier vidé est supprimé (voir `setCartItemQuantity`), donc la lecture rend
        // `null` et non un panier à zéro ligne.
        expect(await readCart(prisma, userId)).toBeNull();
    });

    // La devise se libère avec le dernier article, sinon un panier vidé resterait
    // prisonnier de la devise de son premier achat.
    it("libère la devise quand le panier se vide", async () => {
        const userId = await createUser();
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        const premier = await publishedVariant(euro.id, "EUR", 5000);
        const second = await publishedVariant(cfa.id, "XOF", 30000);

        await addCartItem(prisma, { userId, variantId: premier.variantId, quantity: 1 });
        await setCartItemQuantity(prisma, { userId, variantId: premier.variantId, quantity: 0 });

        await expect(
            addCartItem(prisma, { userId, variantId: second.variantId, quantity: 1 }),
        ).resolves.toBeUndefined();
        expect((await readCart(prisma, userId))?.currency).toBe("XOF");
    });

    it("ne touche pas au panier d'un autre compte", async () => {
        const mien = await createUser();
        const autre = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId: autre, variantId, quantity: 2 });

        await setCartItemQuantity(prisma, { userId: mien, variantId, quantity: 0 });

        expect((await readCart(prisma, autre))?.lines).toHaveLength(1);
        expect(await readCart(prisma, mien)).toBeNull();
    });

    it("abaisse la quantité sans retirer la ligne", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId, quantity: 3 });

        await setCartItemQuantity(prisma, { userId, variantId, quantity: 1 });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(1);
        expect(panier?.lines[0]?.quantity).toBe(1);
    });

    // Le panier ne disparaît qu'avec sa DERNIÈRE ligne : retirer l'une de deux le garde.
    it("garde le panier quand on retire une ligne sur deux", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const premier = await publishedVariant(shop.id, "EUR", 5000);
        const second = await publishedVariant(shop.id, "EUR", 7000);
        await addCartItem(prisma, { userId, variantId: premier.variantId, quantity: 1 });
        await addCartItem(prisma, { userId, variantId: second.variantId, quantity: 4 });

        await setCartItemQuantity(prisma, { userId, variantId: premier.variantId, quantity: 0 });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(1);
        expect(panier?.lines[0]?.variantId).toBe(second.variantId);
        expect(panier?.lines[0]?.quantity).toBe(4);
    });
});

describe("mergeLocalCart", () => {
    it("range ce qui passe et nomme ce qui ne passe pas", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const bon = await publishedVariant(shop.id, "EUR", 5000);

        const { rejected } = await mergeLocalCart(prisma, {
            userId,
            items: [
                { variantId: bon.variantId, quantity: 2 },
                { variantId: "c00000000000000000000000", quantity: 1 },
            ],
        });

        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBe(CART_REJECTION.ineligible);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    // Le panier local peut mélanger des devises : le refus local existe, mais rien
    // n'empêche de bricoler la liste. La remontée garde la première devise rencontrée et
    // nomme le reste.
    it("ne garde qu'une devise et nomme les articles de l'autre", async () => {
        const userId = await createUser();
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        const premier = await publishedVariant(euro.id, "EUR", 5000);
        const second = await publishedVariant(cfa.id, "XOF", 30000);

        const { rejected } = await mergeLocalCart(prisma, {
            userId,
            items: [
                { variantId: premier.variantId, quantity: 1 },
                { variantId: second.variantId, quantity: 1 },
            ],
        });

        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBe(CART_REJECTION.currency);
        const panier = await readCart(prisma, userId);
        expect(panier?.currency).toBe("EUR");
        expect(panier?.lines).toHaveLength(1);
    });

    it("fusionne avec un panier déjà en base plutôt que de l'écraser", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const deja = await publishedVariant(shop.id, "EUR", 5000);
        const nouveau = await publishedVariant(shop.id, "EUR", 7000);
        // Présent en base SEULEMENT : un panier reconstruit depuis la liste locale seule
        // le perdrait.
        const seulEnBase = await publishedVariant(shop.id, "EUR", 9000);
        await addCartItem(prisma, { userId, variantId: deja.variantId, quantity: 1 });
        await addCartItem(prisma, { userId, variantId: seulEnBase.variantId, quantity: 5 });

        await mergeLocalCart(prisma, {
            userId,
            items: [
                { variantId: deja.variantId, quantity: 2 },
                { variantId: nouveau.variantId, quantity: 1 },
            ],
        });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(3);
        // Le local gagne sur la quantité : c'est ce que l'acheteur vient de manipuler.
        const quantite = (id: string) => panier?.lines.find((l) => l.variantId === id)?.quantity;
        expect(quantite(deja.variantId)).toBe(2);
        expect(quantite(nouveau.variantId)).toBe(1);
        expect(quantite(seulEnBase.variantId)).toBe(5);
    });

    it("rend un panier vide sans rien écrire pour une liste vide", async () => {
        const userId = await createUser();

        const { rejected } = await mergeLocalCart(prisma, { userId, items: [] });

        expect(rejected).toHaveLength(0);
        expect(await readCart(prisma, userId)).toBeNull();
    });
});
