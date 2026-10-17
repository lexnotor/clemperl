import {
    countAdministrators,
    createInvitedAdministrator,
    ERROR_ACCOUNT_EMAIL_TAKEN,
    ERROR_ACCOUNT_NOT_FOUND,
    ERROR_LAST_SUPER_ADMIN,
    isAwaitingFirstPassword,
    listAdministrationAccounts,
    prisma,
    setPlatformRole,
} from "@clemperl/db";

// Préfixe propre au fichier : les suites partagent une base qui n'est pas vidée entre deux
// passages, et deux suites qui créent des comptes pareil se marchent dessus.
const PREFIX = "acc";

// Nombre de courses rejouées par le test de concurrence.
const ROUNDS = 20;

let counter = 0;

async function createShop() {
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
            currency: "EUR" as never,
            paymentMethods: ["OFF_PLATFORM"] as never,
        },
    });
}

describe("barrière d'amorçage", () => {
    it("compte les DEUX rôles d'administration : un super_admin seul suffit", async () => {
        // Comparaison par écart : la base est partagée avec d'autres suites, dont l'une
        // porte déjà un `ADMIN`, donc aucun total absolu n'est stable.
        const before = await countAdministrators(prisma);

        const admin = await prisma.user.create({
            data: { email: `${PREFIX}-sa-1@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        expect(await countAdministrators(prisma)).toBe(before + 1);

        // Compter les seuls `ADMIN` rendrait zéro ici, donc rouvrirait l'amorçage sur l'état
        // que l'amorçage produit lui-même : la plateforme se réinstallerait par-dessus son
        // propre propriétaire.
        await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
        expect(await countAdministrators(prisma)).toBe(before + 1);

        await prisma.user.update({ where: { id: admin.id }, data: { role: "CUSTOMER" } });
        expect(await countAdministrators(prisma)).toBe(before);
    });
});

describe("dépôt des comptes d'administration", () => {
    it("crée un compte d'administration sans aucun justificatif, donc en attente", async () => {
        const { id } = await createInvitedAdministrator(prisma, {
            email: `${PREFIX}-1@clemperl.test`,
            name: "Awa",
            role: "ADMIN",
        });
        await expect(isAwaitingFirstPassword(prisma, id)).resolves.toBe(true);
        const liste = await listAdministrationAccounts(prisma);
        expect(liste.find((ligne) => ligne.id === id)?.pending).toBe(true);

        // Dès qu'un justificatif existe, l'attente cesse : c'est la MÊME condition qui décide
        // de la colonne et du courriel, et ce test est ce qui le prouve.
        await prisma.account.create({
            data: {
                id: `${PREFIX}-acc-1`,
                accountId: id,
                providerId: "credential",
                userId: id,
                password: "x",
            },
        });
        await expect(isAwaitingFirstPassword(prisma, id)).resolves.toBe(false);
        const apres = await listAdministrationAccounts(prisma);
        expect(apres.find((ligne) => ligne.id === id)?.pending).toBe(false);
    });

    it("n'attend pas son premier mot de passe quand le compte vient de Google", async () => {
        const { id } = await createInvitedAdministrator(prisma, {
            email: `${PREFIX}-google@clemperl.test`,
            name: "Goga",
            role: "ADMIN",
        });
        // Une ligne `Account` sans mot de passe : un compte Google, pas une invitation.
        await prisma.account.create({
            data: { id: `${PREFIX}-acc-g`, accountId: id, providerId: "google", userId: id },
        });
        await expect(isAwaitingFirstPassword(prisma, id)).resolves.toBe(false);
    });

    it("ne liste que les comptes d'administration", async () => {
        const client = await prisma.user.create({
            data: { email: `${PREFIX}-client@exemple.test`, emailVerified: true },
        });
        const liste = await listAdministrationAccounts(prisma);
        expect(liste.map((ligne) => ligne.id)).not.toContain(client.id);
    });

    it("refuse une adresse déjà prise, nommément", async () => {
        const email = `${PREFIX}-doublon@clemperl.test`;
        await prisma.user.create({ data: { email, emailVerified: true } });
        await expect(
            createInvitedAdministrator(prisma, { email, name: "Awa", role: "ADMIN" }),
        ).rejects.toMatchObject({ message: ERROR_ACCOUNT_EMAIL_TAKEN });
    });

    it("refuse un identifiant qui ne désigne personne", async () => {
        await expect(
            setPlatformRole(prisma, { userId: "usr_inexistant", role: "CUSTOMER" }),
        ).rejects.toMatchObject({ message: ERROR_ACCOUNT_NOT_FOUND });
    });

    // Deux administrateurs retirent le MÊME compte en même temps. L'état visé est atteint et
    // rien ne lève ; c'est `previousRole` qui dit lequel des deux a réellement retiré, donc
    // lequel peut l'annoncer.
    it("rend le rôle précédent, ce qui dit si le retrait a eu lieu", async () => {
        const client = await prisma.user.create({
            data: { email: `${PREFIX}-deja@exemple.test`, emailVerified: true },
        });
        const { previousRole } = await setPlatformRole(prisma, {
            userId: client.id,
            role: "CUSTOMER",
        });
        expect(previousRole).toBe("CUSTOMER");

        const pair = await prisma.user.create({
            data: { email: `${PREFIX}-meme@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        const deux = await Promise.all([
            setPlatformRole(prisma, { userId: pair.id, role: "CUSTOMER" }),
            setPlatformRole(prisma, { userId: pair.id, role: "CUSTOMER" }),
        ]);
        // `all` et non `allSettled` : aucun des deux ne doit lever. Un seul voit `ADMIN`.
        expect(deux.filter((issue) => issue.previousRole === "ADMIN")).toHaveLength(1);
    });

    // Retirer un rôle de plateforme ne touche à rien d'autre : sans ce test, une jointure
    // ajoutée un jour à l'écriture passerait inaperçue jusqu'à ce qu'un ancien administrateur
    // perde ses commandes.
    it("laisse intacts le panier et l'appartenance à une boutique", async () => {
        const compte = await prisma.user.create({
            data: { email: `${PREFIX}-garde@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        const shop = await createShop();
        await prisma.vendorMember.create({
            data: { vendorId: shop.id, userId: compte.id, role: "OWNER" },
        });
        await prisma.cart.create({ data: { userId: compte.id, currency: "EUR" as never } });

        await setPlatformRole(prisma, { userId: compte.id, role: "CUSTOMER" });

        await expect(prisma.vendorMember.count({ where: { userId: compte.id } })).resolves.toBe(1);
        await expect(prisma.cart.count({ where: { userId: compte.id } })).resolves.toBe(1);
    });

    // Les super_admin qu'une autre suite aurait laissés ne changent pas le raisonnement : on
    // retire d'abord tous les autres, pour ne raisonner que sur les deux comptes créés ici.
    async function isolateSuperAdmins(keep: string[]) {
        await prisma.user.updateMany({
            where: { role: "SUPER_ADMIN", id: { notIn: keep } },
            data: { role: "ADMIN" },
        });
    }

    it("laisse retirer un super_admin tant qu'il en reste un autre, et refuse le dernier", async () => {
        const un = await prisma.user.create({
            data: { email: `${PREFIX}-sa-a@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        const deux = await prisma.user.create({
            data: { email: `${PREFIX}-sa-b@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        await isolateSuperAdmins([un.id, deux.id]);

        await setPlatformRole(prisma, { userId: un.id, role: "CUSTOMER" });
        await expect(
            setPlatformRole(prisma, { userId: deux.id, role: "CUSTOMER" }),
        ).rejects.toMatchObject({ message: ERROR_LAST_SUPER_ADMIN });

        // Le compte reste INTACT : retirer n'est pas supprimer.
        await expect(prisma.user.findUnique({ where: { id: un.id } })).resolves.toMatchObject({
            role: "CUSTOMER",
            email: `${PREFIX}-sa-a@clemperl.test`,
        });
    });

    // Une seule course ne rougit que de temps en temps sans le verrou : la fenêtre entre la
    // lecture du compte et l'écriture est courte. On la rejoue sur des paires neuves, chacune
    // avec son propre état à vérifier, pour que l'absence de garde se voie à coup sûr.
    it("ne laisse JAMAIS zéro super_admin, même sur deux retraits simultanés", async () => {
        for (let round = 0; round < ROUNDS; round += 1) {
            const un = await prisma.user.create({
                data: {
                    email: `${PREFIX}-race-a-${round}@clemperl.test`,
                    emailVerified: true,
                    role: "SUPER_ADMIN",
                },
            });
            const deux = await prisma.user.create({
                data: {
                    email: `${PREFIX}-race-b-${round}@clemperl.test`,
                    emailVerified: true,
                    role: "SUPER_ADMIN",
                },
            });
            await isolateSuperAdmins([un.id, deux.id]);

            // `allSettled` et non `all` : l'un des deux DOIT échouer, et `all` ferait tomber
            // le test sur ce refus au lieu de l'observer.
            const issues = await Promise.allSettled([
                setPlatformRole(prisma, { userId: un.id, role: "CUSTOMER" }),
                setPlatformRole(prisma, { userId: deux.id, role: "CUSTOMER" }),
            ]);

            // L'assertion porte sur l'ÉTAT, pas sur lequel des deux a gagné : les deux ordres
            // sont légitimes, et exiger un vainqueur ferait un test instable.
            const restants = await prisma.user.count({
                where: { role: "SUPER_ADMIN", deletedAt: null },
            });
            expect(restants).toBe(1);
            expect(issues.filter((issue) => issue.status === "rejected")).toHaveLength(1);
            expect(issues.find((issue) => issue.status === "rejected")).toMatchObject({
                reason: { message: ERROR_LAST_SUPER_ADMIN },
            });
        }
    });
});
