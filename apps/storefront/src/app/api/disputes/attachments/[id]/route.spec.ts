import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const readDisputeAttachmentForBuyer = vi.fn();
const readDocument = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@clemperl/auth", () => ({
    auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    readDisputeAttachmentForBuyer: (...args: unknown[]) => readDisputeAttachmentForBuyer(...args),
}));
vi.mock("@clemperl/core", () => ({ readDocument: (...args: unknown[]) => readDocument(...args) }));

const { GET } = await import("./route");

const call = (id: string) => GET(new Request("http://localhost/api"), { params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockResolvedValue({ user: { id: "buyer-1" } });
    readDocument.mockResolvedValue(new Blob(["jpeg"]));
});

describe("servir une pièce à l'acheteur", () => {
    it("répond 404 sans session, sans rien lire", async () => {
        getSession.mockResolvedValue(null);

        expect((await call("p1")).status).toBe(404);
        expect(readDisputeAttachmentForBuyer).not.toHaveBeenCalled();
    });

    // 404 et non 403 : répondre « interdit » confirmerait que la pièce existe.
    it("répond 404 à une pièce hors de sa portée", async () => {
        readDisputeAttachmentForBuyer.mockResolvedValue(null);

        expect((await call("p1")).status).toBe(404);
        expect(readDisputeAttachmentForBuyer).toHaveBeenCalledWith(expect.anything(), {
            attachmentId: "p1",
            buyerId: "buyer-1",
        });
    });

    it("sert la pièce avec son type, sans laisser le navigateur le deviner", async () => {
        readDisputeAttachmentForBuyer.mockResolvedValue({
            objectPath: "disputes/x/evidence-1.jpg",
            mimeType: "image/jpeg",
            originalName: "colis abîmé.jpg",
        });

        const response = await call("p1");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/jpeg");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(response.headers.get("Content-Disposition")).toBe('inline; filename="colis_ab_m_.jpg"');
    });
});
