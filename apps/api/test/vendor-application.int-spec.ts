import {
    createApplication,
    decideOnApplication,
    ERROR_APPLICATION_ALREADY_DECIDED,
    prisma,
    resubmitApplication,
} from "@clemperl/db";
import { slugifyShopName } from "@clemperl/domain";

// Quatre vérités qui vivent dans PostgreSQL et qu'aucun test unitaire ne peut établir :
// une contrainte partielle, une course entre deux écritures, l'atomicité d'une création
// double, et une unicité.
const FIELDS = {
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

const DOCUMENTS = [
    {
        kind: "REGISTRY" as const,
        objectPath: "submission/registry.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        originalName: "rccm.pdf",
    },
];

let counter = 0;
async function createAccount(prefix: string): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
        data: { email: `${prefix}-${counter}@clemperl.test`, name: prefix, emailVerified: true },
    });
    return user.id;
}

describe("repository du dossier vendeur", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("refuse un second dossier ouvert pour le même candidat", async () => {
        const applicant = await createAccount("double");
        await createApplication(prisma, { applicantId: applicant, fields: FIELDS, documents: DOCUMENTS });

        await expect(
            createApplication(prisma, { applicantId: applicant, fields: FIELDS, documents: DOCUMENTS }),
        ).rejects.toThrow(/vendor_applications_applicant_open_key/);
    });

    it("ne laisse qu'une seule décision aboutir sur un dossier", async () => {
        const applicant = await createAccount("race");
        const admin = await createAccount("admin");
        const { id } = await createApplication(prisma, {
            applicantId: applicant,
            fields: FIELDS,
            documents: DOCUMENTS,
        });

        const rejection = {
            applicationId: id,
            decidedById: admin,
            outcome: "REJECTED" as const,
            reason: "INCOMPLETE_FILE" as const,
        };
        const results = await Promise.allSettled([
            decideOnApplication(prisma, rejection),
            decideOnApplication(prisma, rejection),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(String(failed.reason)).toContain(ERROR_APPLICATION_ALREADY_DECIDED);
        expect(await prisma.vendorDecision.count({ where: { applicationId: id } })).toBe(1);
    });

    it("crée le vendeur et son propriétaire dans la même transaction", async () => {
        const applicant = await createAccount("approved");
        const admin = await createAccount("admin");
        const name = `Atelier ${Date.now()}`;
        const { id } = await createApplication(prisma, {
            applicantId: applicant,
            fields: { ...FIELDS, shopName: name },
            documents: DOCUMENTS,
        });

        const { vendorId } = await decideOnApplication(prisma, {
            applicationId: id,
            decidedById: admin,
            outcome: "ACCEPTED",
            slug: slugifyShopName(name),
        });

        expect(vendorId).not.toBeNull();
        const members = await prisma.vendorMember.findMany({ where: { vendorId: vendorId! } });
        expect(members).toHaveLength(1);
        expect(members[0]?.role).toBe("OWNER");
        expect(members[0]?.userId).toBe(applicant);
        const application = await prisma.vendorApplication.findUniqueOrThrow({ where: { id } });
        expect(application.vendorId).toBe(vendorId);
    });

    it("refuse deux boutiques homonymes à l'acceptation", async () => {
        const name = `Homonyme ${Date.now()}`;
        const slug = slugifyShopName(name);
        const admin = await createAccount("admin");

        const first = await createAccount("homonym");
        const firstApplication = await createApplication(prisma, {
            applicantId: first,
            fields: { ...FIELDS, shopName: name },
            documents: DOCUMENTS,
        });
        await decideOnApplication(prisma, {
            applicationId: firstApplication.id,
            decidedById: admin,
            outcome: "ACCEPTED",
            slug,
        });

        const second = await createAccount("homonym");
        const secondApplication = await createApplication(prisma, {
            applicantId: second,
            fields: { ...FIELDS, shopName: name },
            documents: DOCUMENTS,
        });

        await expect(
            decideOnApplication(prisma, {
                applicationId: secondApplication.id,
                decidedById: admin,
                outcome: "ACCEPTED",
                slug,
            }),
        ).rejects.toThrow(/vendors_slug_key/);
    });

    it("remet un dossier refusé en examen et remplace ses pièces", async () => {
        const applicant = await createAccount("resubmission");
        const admin = await createAccount("admin");
        const { id } = await createApplication(prisma, {
            applicantId: applicant,
            fields: FIELDS,
            documents: DOCUMENTS,
        });
        await decideOnApplication(prisma, {
            applicationId: id,
            decidedById: admin,
            outcome: "REJECTED",
            reason: "UNREADABLE_DOCUMENT",
        });

        await resubmitApplication(prisma, {
            applicationId: id,
            fields: FIELDS,
            documents: [{ ...DOCUMENTS[0]!, objectPath: "submission-2/registry.pdf" }],
        });

        const application = await prisma.vendorApplication.findUniqueOrThrow({
            where: { id },
            include: { documents: true, decisions: true },
        });
        expect(application.status).toBe("SUBMITTED");
        expect(application.documents).toHaveLength(1);
        expect(application.documents[0]?.objectPath).toBe("submission-2/registry.pdf");
        expect(application.decisions).toHaveLength(1);
    });
});
