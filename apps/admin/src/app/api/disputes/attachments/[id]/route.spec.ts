import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdministrator = vi.fn();
const readDisputeAttachmentForAdministration = vi.fn();
const readDocument = vi.fn();

vi.mock("../../../../../lib/session", () => ({
    requireAdministrator: (...args: unknown[]) => requireAdministrator(...args),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    readDisputeAttachmentForAdministration: (...args: unknown[]) =>
        readDisputeAttachmentForAdministration(...args),
}));
// Seule la lecture du stockage est simulée : les en-têtes viennent du vrai utilitaire.
vi.mock("@clemperl/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clemperl/core")>()),
    readDocument: (...args: unknown[]) => readDocument(...args),
}));

const { GET } = await import("./route");

const call = (id: string) => GET(new Request("http://localhost/api"), { params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.resetAllMocks();
    requireAdministrator.mockResolvedValue({ user: { id: "admin-1" } });
    readDocument.mockResolvedValue(new Blob(["jpeg"]));
});

describe("servir une pièce à l'administration", () => {
    // La garde de l'administration répond elle-même à un intrus ; la route s'arrête avant
    // toute lecture.
    it("s'arrête quand la garde refuse", async () => {
        requireAdministrator.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

        await expect(call("p1")).rejects.toThrow("NEXT_NOT_FOUND");
        expect(readDisputeAttachmentForAdministration).not.toHaveBeenCalled();
    });

    it("répond 404 à une pièce inconnue", async () => {
        readDisputeAttachmentForAdministration.mockResolvedValue(null);

        expect((await call("p1")).status).toBe(404);
    });

    it("sert la pièce avec son type", async () => {
        readDisputeAttachmentForAdministration.mockResolvedValue({
            objectPath: "disputes/x/evidence-1.jpg",
            mimeType: "image/jpeg",
            originalName: "colis.jpg",
        });

        const response = await call("p1");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/jpeg");
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    });
});
