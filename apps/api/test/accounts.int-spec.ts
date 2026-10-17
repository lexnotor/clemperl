import {
    countAdministrators,
    createInvitedAdministrator,
    ERROR_ACCOUNT_EMAIL_TAKEN,
    ERROR_ACCOUNT_NOT_FOUND,
    ERROR_ACCOUNT_ROLE_CHANGED,
    ERROR_LAST_SUPER_ADMIN,
    isPendingAdministratorInvitation,
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
        await expect(isPendingAdministratorInvitation(prisma, id)).resolves.toBe(true);
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
        await expect(isPendingAdministratorInvitation(prisma, id)).resolves.toBe(false);
        const apres = await listAdministrationAccounts(prisma);
        expect(apres.find((ligne) => ligne.id === id)?.pending).toBe(false);
    });

    // Un invité retiré avant d'avoir réclamé garde sa ligne `User` SANS justificatif. Sans
    // la condition de rôle, il recevrait encore « votre compte d'administration est prêt »
    // le jour où il passe par « mot de passe oublié », alors qu'il n'administre plus rien.
    it("cesse d'être une invitation dès que le rôle est retiré", async () => {
        const { id } = await createInvitedAdministrator(prisma, {
            email: `${PREFIX}-invite-retiree@clemperl.test`,
            name: "Rémi",
            role: "ADMIN",
        });
        await expect(isPendingAdministratorInvitation(prisma, id)).resolves.toBe(true);

        await setPlatformRole(prisma, { userId: id, expectedRole: "ADMIN", role: "CUSTOMER" });

        await expect(isPendingAdministratorInvitation(prisma, id)).resolves.toBe(false);
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
        await expect(isPendingAdministratorInvitation(prisma, id)).resolves.toBe(false);
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
            setPlatformRole(prisma, {
                userId: "usr_inexistant",
                role: "CUSTOMER",
                expectedRole: "ADMIN",
            }),
        ).rejects.toMatchObject({ message: ERROR_ACCOUNT_NOT_FOUND });
    });

    it("rend le rôle précédent, qui est celui qu'on attendait", async () => {
        const compte = await prisma.user.create({
            data: { email: `${PREFIX}-prec@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        const { previousRole } = await setPlatformRole(prisma, {
            userId: compte.id,
            role: "CUSTOMER",
            expectedRole: "ADMIN",
        });
        expect(previousRole).toBe("ADMIN");
    });

    // Deux administrateurs retirent le MÊME compte en même temps : l'état visé est atteint
    // et rien ne lève, ni pour l'un ni pour l'autre.
    it("laisse deux retraits simultanés du même compte aboutir sans lever", async () => {
        const pair = await prisma.user.create({
            data: { email: `${PREFIX}-meme@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        await Promise.all([
            setPlatformRole(prisma, { userId: pair.id, role: "CUSTOMER", expectedRole: "ADMIN" }),
            setPlatformRole(prisma, { userId: pair.id, role: "CUSTOMER", expectedRole: "ADMIN" }),
        ]);
        await expect(prisma.user.findUnique({ where: { id: pair.id } })).resolves.toMatchObject({
            role: "CUSTOMER",
        });
    });

    it("laisse deux élévations simultanées du même compte aboutir sans lever", async () => {
        const pair = await prisma.user.create({
            data: { email: `${PREFIX}-double@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        await Promise.all([
            setPlatformRole(prisma, {
                userId: pair.id,
                role: "SUPER_ADMIN",
                expectedRole: "ADMIN",
            }),
            setPlatformRole(prisma, {
                userId: pair.id,
                role: "SUPER_ADMIN",
                expectedRole: "ADMIN",
            }),
        ]);
        await expect(prisma.user.findUnique({ where: { id: pair.id } })).resolves.toMatchObject({
            role: "SUPER_ADMIN",
        });
    });

    // Le cas grave : la cible lue `ADMIN` a été retirée entre la lecture et l'écriture. Sans
    // la comparaison sous verrou, l'élévation transformait un simple client en super_admin.
    it("refuse d'élever un compte retiré entre-temps, et le laisse CUSTOMER", async () => {
        const compte = await prisma.user.create({
            data: { email: `${PREFIX}-retire@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        await prisma.user.update({ where: { id: compte.id }, data: { role: "CUSTOMER" } });

        await expect(
            setPlatformRole(prisma, {
                userId: compte.id,
                role: "SUPER_ADMIN",
                expectedRole: "ADMIN",
            }),
        ).rejects.toMatchObject({ message: ERROR_ACCOUNT_ROLE_CHANGED });
        await expect(prisma.user.findUnique({ where: { id: compte.id } })).resolves.toMatchObject({
            role: "CUSTOMER",
        });
    });

    // Le symétrique : un ADMIN lu pour un retrait a été élevé entre-temps. L'acteur n'avait
    // décidé que pour un `ADMIN`, pas pour un super_admin.
    it("refuse de retirer un compte élevé entre-temps, et le laisse SUPER_ADMIN", async () => {
        const compte = await prisma.user.create({
            data: { email: `${PREFIX}-eleve@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        await prisma.user.update({ where: { id: compte.id }, data: { role: "SUPER_ADMIN" } });

        await expect(
            setPlatformRole(prisma, {
                userId: compte.id,
                role: "CUSTOMER",
                expectedRole: "ADMIN",
            }),
        ).rejects.toMatchObject({ message: ERROR_ACCOUNT_ROLE_CHANGED });
        await expect(prisma.user.findUnique({ where: { id: compte.id } })).resolves.toMatchObject({
            role: "SUPER_ADMIN",
        });
    });

    // Retirer un rôle de plateforme ne touche à rien d'autre. On vérifie le panier et
    // l'appartenance à une boutique, deux tables liées au compte : l'écriture est une mise à
    // jour d'une seule colonne de `users`, qui ne peut en atteindre une autre, donc ces deux
    // témoins suffisent à voir passer une jointure ou une cascade ajoutée un jour.
    it("laisse intacts le panier et l'appartenance à une boutique", async () => {
        const compte = await prisma.user.create({
            data: { email: `${PREFIX}-garde@clemperl.test`, emailVerified: true, role: "ADMIN" },
        });
        const shop = await createShop();
        await prisma.vendorMember.create({
            data: { vendorId: shop.id, userId: compte.id, role: "OWNER" },
        });
        await prisma.cart.create({ data: { userId: compte.id, currency: "EUR" as never } });

        await setPlatformRole(prisma, { userId: compte.id, role: "CUSTOMER", expectedRole: "ADMIN" });

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

    // Un compte UTILISABLE porte au moins une ligne `Account` : sans elle, personne ne peut
    // s'y connecter, c'est une invitation jamais honorée.
    async function makeUsable(userId: string) {
        await prisma.account.create({
            data: { id: `${PREFIX}-use-${userId}`, accountId: userId, providerId: "credential", userId },
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
        await makeUsable(un.id);
        await makeUsable(deux.id);

        await setPlatformRole(prisma, { userId: un.id, role: "CUSTOMER", expectedRole: "SUPER_ADMIN" });
        await expect(
            setPlatformRole(prisma, { userId: deux.id, role: "CUSTOMER", expectedRole: "SUPER_ADMIN" }),
        ).rejects.toMatchObject({ message: ERROR_LAST_SUPER_ADMIN });

        // Le compte reste INTACT : retirer n'est pas supprimer.
        await expect(prisma.user.findUnique({ where: { id: un.id } })).resolves.toMatchObject({
            role: "CUSTOMER",
            email: `${PREFIX}-sa-a@clemperl.test`,
        });
    });

    // Une invitation jamais honorée porte le rôle sans que personne puisse s'y connecter : la
    // compter comme super_admin laisserait le seul compte utilisable se retirer, et plus
    // aucun humain n'atteindrait l'administration.
    it("refuse de retirer le seul super_admin utilisable quand l'autre est une invitation en attente", async () => {
        const utilisable = await prisma.user.create({
            data: { email: `${PREFIX}-sa-u@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        const attente = await prisma.user.create({
            data: { email: `${PREFIX}-sa-p@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        await isolateSuperAdmins([utilisable.id, attente.id]);
        await makeUsable(utilisable.id);

        await expect(
            setPlatformRole(prisma, {
                userId: utilisable.id,
                role: "CUSTOMER",
                expectedRole: "SUPER_ADMIN",
            }),
        ).rejects.toMatchObject({ message: ERROR_LAST_SUPER_ADMIN });
        await expect(
            prisma.user.findUnique({ where: { id: utilisable.id } }),
        ).resolves.toMatchObject({ role: "SUPER_ADMIN" });
    });

    // Le nettoyage d'une invitation mal adressée doit rester possible.
    it("laisse retirer un super_admin en attente tant qu'un utilisable reste", async () => {
        const utilisable = await prisma.user.create({
            data: { email: `${PREFIX}-sa-u2@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        const attente = await prisma.user.create({
            data: { email: `${PREFIX}-sa-p2@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        await isolateSuperAdmins([utilisable.id, attente.id]);
        await makeUsable(utilisable.id);

        await setPlatformRole(prisma, {
            userId: attente.id,
            role: "CUSTOMER",
            expectedRole: "SUPER_ADMIN",
        });
        await expect(prisma.user.findUnique({ where: { id: attente.id } })).resolves.toMatchObject({
            role: "CUSTOMER",
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
            await makeUsable(un.id);
            await makeUsable(deux.id);

            // `allSettled` et non `all` : l'un des deux DOIT échouer, et `all` ferait tomber
            // le test sur ce refus au lieu de l'observer.
            const issues = await Promise.allSettled([
                setPlatformRole(prisma, { userId: un.id, role: "CUSTOMER", expectedRole: "SUPER_ADMIN" }),
                setPlatformRole(prisma, { userId: deux.id, role: "CUSTOMER", expectedRole: "SUPER_ADMIN" }),
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
