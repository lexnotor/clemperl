import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const readVendorForMember = vi.fn();
const readDisputeAttachmentForVendor = vi.fn();
const readDocument = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@clemperl/auth", () => ({
    auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    readVendorForMember: (...args: unknown[]) => readVendorForMember(...args),
    readDisputeAttachmentForVendor: (...args: unknown[]) => readDisputeAttachmentForVendor(...args),
}));
vi.mock("@clemperl/core", () => ({ readDocument: (...args: unknown[]) => readDocument(...args) }));

const { GET } = await import("./route");

const call = (id: string) => GET(new Request("http://localhost/api"), { params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockResolvedValue({ user: { id: "membre-1" } });
    readVendorForMember.mockResolvedValue({ id: "boutique-1" });
    readDocument.mockResolvedValue(new Blob(["pdf"]));
});

describe("servir une pièce à la boutique", () => {
    it("répond 404 sans session", async () => {
        getSession.mockResolvedValue(null);

        expect((await call("p1")).status).toBe(404);
        expect(readDisputeAttachmentForVendor).not.toHaveBeenCalled();
    });

    it("répond 404 à un compte qui n'est membre d'aucune boutique", async () => {
        readVendorForMember.mockResolvedValue(null);

        expect((await call("p1")).status).toBe(404);
        expect(readDisputeAttachmentForVendor).not.toHaveBeenCalled();
    });

    // 404 et non 403 : répondre « interdit » confirmerait que la pièce existe.
    it("répond 404 à une pièce d'une autre boutique", async () => {
        readDisputeAttachmentForVendor.mockResolvedValue(null);

        expect((await call("p1")).status).toBe(404);
        expect(readDisputeAttachmentForVendor).toHaveBeenCalledWith(expect.anything(), {
            attachmentId: "p1",
            vendorId: "boutique-1",
        });
    });

    it("sert la pièce de sa boutique", async () => {
        readDisputeAttachmentForVendor.mockResolvedValue({
            objectPath: "disputes/x/evidence-1.pdf",
            mimeType: "application/pdf",
            originalName: "bon.pdf",
        });

        const response = await call("p1");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/pdf");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
});
