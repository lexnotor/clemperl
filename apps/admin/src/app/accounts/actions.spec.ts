import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: { id: "actor", role: "ADMIN" } };
const requestPasswordReset = vi.fn();
const setPlatformRole = vi.fn();
const createInvitedAdministrator = vi.fn();
const isPendingAdministratorInvitation = vi.fn();
const findFirst = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/session", () => ({ requireAdministrator: async () => session }));
vi.mock("@clemperl/auth", () => ({ auth: { api: { requestPasswordReset } } }));
vi.mock("@clemperl/db", () => ({
    prisma: { user: { findFirst } },
    ERROR_ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
    ERROR_ACCOUNT_ROLE_CHANGED: "ACCOUNT_ROLE_CHANGED",
    ERROR_ACCOUNT_EMAIL_TAKEN: "ACCOUNT_EMAIL_TAKEN",
    ERROR_LAST_SUPER_ADMIN: "LAST_SUPER_ADMIN",
    createInvitedAdministrator,
    setPlatformRole,
    isPendingAdministratorInvitation,
}));

const { changeRole, invite, resendInvitation } = await import("./actions");

function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const EMPTY = { message: [] };

beforeEach(() => {
    vi.clearAllMocks();
    session.user.role = "ADMIN";
    createInvitedAdministrator.mockResolvedValue({ id: "new" });
    requestPasswordReset.mockResolvedValue({ status: true });
});

describe("invite", () => {
    it("refuse SUPER_ADMIN à un administrateur, sans rien créer", async () => {
        const result = await invite(
            EMPTY,
            form({ name: "Léa", email: "lea@clemperl.test", role: "SUPER_ADMIN" }),
        );

        expect(result.message).toEqual(["Votre niveau ne permet pas cette action."]);
        expect(createInvitedAdministrator).not.toHaveBeenCalled();
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it("refuse un niveau vide ou inventé", async () => {
        for (const role of ["", "OWNER", "CUSTOMER"]) {
            const result = await invite(
                EMPTY,
                form({ name: "Léa", email: "lea@clemperl.test", role }),
            );
            expect(result.message).toEqual(["Le nom, l'adresse ou le niveau est invalide."]);
        }
        expect(createInvitedAdministrator).not.toHaveBeenCalled();
    });

    it("crée le compte puis envoie UN courriel, sans en-têtes", async () => {
        session.user.role = "SUPER_ADMIN";
        const result = await invite(
            EMPTY,
            form({ name: "Léa", email: "Lea@Clemperl.test", role: "SUPER_ADMIN" }),
        );

        expect(result.message).toEqual(["Invitation envoyée."]);
        expect(createInvitedAdministrator).toHaveBeenCalledWith(expect.anything(), {
            email: "lea@clemperl.test",
            name: "Léa",
            role: "SUPER_ADMIN",
        });
        expect(requestPasswordReset).toHaveBeenCalledTimes(1);
        expect(requestPasswordReset).toHaveBeenCalledWith({
            body: { email: "lea@clemperl.test", redirectTo: "/reset-password" },
        });
    });

    it("garde le compte créé quand le courriel échoue", async () => {
        requestPasswordReset.mockRejectedValue(new Error("smtp"));
        const result = await invite(
            EMPTY,
            form({ name: "Léa", email: "lea@clemperl.test", role: "ADMIN" }),
        );

        expect(createInvitedAdministrator).toHaveBeenCalledTimes(1);
        expect(result.message[0]).toContain("Renvoyer l'invitation");
    });

    it("traduit une adresse déjà prise", async () => {
        createInvitedAdministrator.mockRejectedValue(new Error("ACCOUNT_EMAIL_TAKEN"));
        const result = await invite(
            EMPTY,
            form({ name: "Léa", email: "lea@clemperl.test", role: "ADMIN" }),
        );

        expect(result.message).toEqual(["Un compte existe déjà avec cette adresse."]);
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });
});

describe("changeRole", () => {
    it("refuse à un administrateur d'élever en SUPER_ADMIN", async () => {
        findFirst.mockResolvedValue({ role: "ADMIN" });
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "SUPER_ADMIN" }));

        expect(result.message).toEqual(["Votre niveau ne permet pas cette action."]);
        expect(setPlatformRole).not.toHaveBeenCalled();
    });

    it("refuse de rétrograder un super_admin vers ADMIN, quel que soit l'acteur", async () => {
        session.user.role = "SUPER_ADMIN";
        findFirst.mockResolvedValue({ role: "SUPER_ADMIN" });
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "ADMIN" }));

        expect(result.message).toEqual(["Votre niveau ne permet pas cette action."]);
        expect(setPlatformRole).not.toHaveBeenCalled();
    });

    it("refuse un administrateur qui retire un super_admin", async () => {
        findFirst.mockResolvedValue({ role: "SUPER_ADMIN" });
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "CUSTOMER" }));

        expect(result.message).toEqual(["Votre niveau ne permet pas cette action."]);
        expect(setPlatformRole).not.toHaveBeenCalled();
    });

    it("refuse un identifiant absent ou inventé", async () => {
        findFirst.mockResolvedValue(null);
        for (const userId of ["", "inventé"]) {
            const result = await changeRole(EMPTY, form({ userId, role: "CUSTOMER" }));
            expect(result.message).toEqual([
                "Ce compte n'existe plus ou n'est plus un compte d'administration.",
            ]);
        }
        expect(setPlatformRole).not.toHaveBeenCalled();
    });

    it("n'annonce pas un retrait visant un compte déjà CUSTOMER", async () => {
        findFirst.mockResolvedValue({ role: "CUSTOMER" });
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "CUSTOMER" }));

        expect(result.message[0]).toContain("n'existe plus");
        expect(setPlatformRole).not.toHaveBeenCalled();
    });

    it("traduit un compte qui a bougé entre la lecture et l'écriture", async () => {
        findFirst.mockResolvedValue({ role: "ADMIN" });
        setPlatformRole.mockRejectedValue(new Error("ACCOUNT_ROLE_CHANGED"));
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "CUSTOMER" }));

        expect(result.message[0]).toContain("Rechargez");
    });

    it("passe au dépôt le rôle lu comme rôle attendu", async () => {
        session.user.role = "SUPER_ADMIN";
        findFirst.mockResolvedValue({ role: "ADMIN" });
        setPlatformRole.mockResolvedValue({ previousRole: "ADMIN" });
        await changeRole(EMPTY, form({ userId: "u1", role: "SUPER_ADMIN" }));

        expect(setPlatformRole).toHaveBeenCalledWith(expect.anything(), {
            userId: "u1",
            role: "SUPER_ADMIN",
            expectedRole: "ADMIN",
        });
    });

    it("traduit le refus du dernier super_admin sans le devancer", async () => {
        session.user.role = "SUPER_ADMIN";
        findFirst.mockResolvedValue({ role: "SUPER_ADMIN" });
        setPlatformRole.mockRejectedValue(new Error("LAST_SUPER_ADMIN"));
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "CUSTOMER" }));

        expect(result.message[0]).toContain("dernier super-administrateur");
    });

    it("retire un administrateur", async () => {
        findFirst.mockResolvedValue({ role: "ADMIN" });
        setPlatformRole.mockResolvedValue({ previousRole: "ADMIN" });
        const result = await changeRole(EMPTY, form({ userId: "u1", role: "CUSTOMER" }));

        expect(result.message).toEqual([]);
        expect(setPlatformRole).toHaveBeenCalledWith(expect.anything(), {
            userId: "u1",
            role: "CUSTOMER",
            expectedRole: "ADMIN",
        });
    });
});

describe("resendInvitation", () => {
    it("refuse un compte qui a déjà son mot de passe, sans rien envoyer", async () => {
        findFirst.mockResolvedValue({ email: "a@clemperl.test", role: "ADMIN" });
        isPendingAdministratorInvitation.mockResolvedValue(false);
        const result = await resendInvitation(EMPTY, form({ userId: "u1" }));

        expect(result.message[0]).toContain("déjà choisi son mot de passe");
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it("refuse un identifiant absent ou inventé", async () => {
        findFirst.mockResolvedValue(null);
        for (const userId of ["", "inventé"]) {
            const result = await resendInvitation(EMPTY, form({ userId }));
            expect(result.message[0]).toContain("n'existe plus");
        }
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it("renvoie le lien à une invitation en attente", async () => {
        findFirst.mockResolvedValue({ email: "a@clemperl.test", role: "ADMIN" });
        isPendingAdministratorInvitation.mockResolvedValue(true);
        const result = await resendInvitation(EMPTY, form({ userId: "u1" }));

        expect(result.message).toEqual(["Invitation renvoyée."]);
        expect(requestPasswordReset).toHaveBeenCalledWith({
            body: { email: "a@clemperl.test", redirectTo: "/reset-password" },
        });
    });
});
