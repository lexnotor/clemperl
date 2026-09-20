import {
    creerDossier,
    deciderSurDossier,
    ERREUR_DOSSIER_DEJA_DECIDE,
    prisma,
    resoumettreDossier,
} from "@clemperl/db";
import { slugifierNomBoutique } from "@clemperl/domain";

// Quatre vérités qui vivent dans PostgreSQL et qu'aucun test unitaire ne peut établir :
// une contrainte partielle, une course entre deux écritures, l'atomicité d'une création
// double, et une unicité.
const CHAMPS = {
    locale: "fr",
    shopName: "Chez Clem",
    shopDescription: "Maroquinerie artisanale, pièces uniques cousues main.",
    contactEmail: "contact@chezclem.test",
    contactPhone: "+32470000000",
    categories: ["LEATHER_GOODS" as const],
    legalForm: "SRL",
    legalName: "Chez Clem SRL",
    registrationNumber: "0123456789",
    country: "BE",
};

const PIECES = [
    {
        kind: "REGISTRY" as const,
        objectPath: "soumission/registre.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        originalName: "rccm.pdf",
    },
];

let compteur = 0;
async function creerCompte(prefixe: string): Promise<string> {
    compteur += 1;
    const utilisateur = await prisma.user.create({
        data: { email: `${prefixe}-${compteur}@clemperl.test`, name: prefixe, emailVerified: true },
    });
    return utilisateur.id;
}

describe("repository du dossier vendeur", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("refuse un second dossier ouvert pour le même candidat", async () => {
        const candidat = await creerCompte("double");
        await creerDossier(prisma, { applicantId: candidat, champs: CHAMPS, pieces: PIECES });

        await expect(
            creerDossier(prisma, { applicantId: candidat, champs: CHAMPS, pieces: PIECES }),
        ).rejects.toThrow(/vendor_applications_applicant_open_key/);
    });

    it("ne laisse qu'une seule décision aboutir sur un dossier", async () => {
        const candidat = await creerCompte("course");
        const admin = await creerCompte("admin");
        const { id } = await creerDossier(prisma, {
            applicantId: candidat,
            champs: CHAMPS,
            pieces: PIECES,
        });

        const refus = {
            applicationId: id,
            decidedById: admin,
            decision: "REJECTED" as const,
            reason: "INCOMPLETE_FILE" as const,
        };
        const resultats = await Promise.allSettled([
            deciderSurDossier(prisma, refus),
            deciderSurDossier(prisma, refus),
        ]);

        expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const echec = resultats.find((r) => r.status === "rejected");
        expect(String((echec as PromiseRejectedResult).reason)).toContain(
            ERREUR_DOSSIER_DEJA_DECIDE,
        );
        expect(await prisma.vendorDecision.count({ where: { applicationId: id } })).toBe(1);
    });

    it("crée le vendeur et son propriétaire dans la même transaction", async () => {
        const candidat = await creerCompte("accepte");
        const admin = await creerCompte("admin");
        const nom = `Atelier ${Date.now()}`;
        const { id } = await creerDossier(prisma, {
            applicantId: candidat,
            champs: { ...CHAMPS, shopName: nom },
            pieces: PIECES,
        });

        const { vendorId } = await deciderSurDossier(prisma, {
            applicationId: id,
            decidedById: admin,
            decision: "ACCEPTED",
            slug: slugifierNomBoutique(nom),
        });

        expect(vendorId).not.toBeNull();
        const membres = await prisma.vendorMember.findMany({ where: { vendorId: vendorId! } });
        expect(membres).toHaveLength(1);
        expect(membres[0]?.role).toBe("OWNER");
        expect(membres[0]?.userId).toBe(candidat);
        const dossier = await prisma.vendorApplication.findUniqueOrThrow({ where: { id } });
        expect(dossier.vendorId).toBe(vendorId);
    });

    it("refuse deux boutiques homonymes à l'acceptation", async () => {
        const nom = `Homonyme ${Date.now()}`;
        const slug = slugifierNomBoutique(nom);
        const admin = await creerCompte("admin");

        const premier = await creerCompte("homonyme");
        const dossierA = await creerDossier(prisma, {
            applicantId: premier,
            champs: { ...CHAMPS, shopName: nom },
            pieces: PIECES,
        });
        await deciderSurDossier(prisma, {
            applicationId: dossierA.id,
            decidedById: admin,
            decision: "ACCEPTED",
            slug,
        });

        const second = await creerCompte("homonyme");
        const dossierB = await creerDossier(prisma, {
            applicantId: second,
            champs: { ...CHAMPS, shopName: nom },
            pieces: PIECES,
        });

        await expect(
            deciderSurDossier(prisma, {
                applicationId: dossierB.id,
                decidedById: admin,
                decision: "ACCEPTED",
                slug,
            }),
        ).rejects.toThrow(/vendors_slug_key/);
    });

    it("remet un dossier refusé en examen et remplace ses pièces", async () => {
        const candidat = await creerCompte("resoumission");
        const admin = await creerCompte("admin");
        const { id } = await creerDossier(prisma, {
            applicantId: candidat,
            champs: CHAMPS,
            pieces: PIECES,
        });
        await deciderSurDossier(prisma, {
            applicationId: id,
            decidedById: admin,
            decision: "REJECTED",
            reason: "UNREADABLE_DOCUMENT",
        });

        await resoumettreDossier(prisma, {
            applicationId: id,
            champs: CHAMPS,
            pieces: [{ ...PIECES[0]!, objectPath: "soumission-2/registre.pdf" }],
        });

        const dossier = await prisma.vendorApplication.findUniqueOrThrow({
            where: { id },
            include: { documents: true, decisions: true },
        });
        expect(dossier.status).toBe("SUBMITTED");
        expect(dossier.documents).toHaveLength(1);
        expect(dossier.documents[0]?.objectPath).toBe("soumission-2/registre.pdf");
        expect(dossier.decisions).toHaveLength(1);
    });
});
