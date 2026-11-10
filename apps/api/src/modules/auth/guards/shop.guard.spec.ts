import { readVendorForMember } from "@clemperl/db";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { ShopGuard } from "./shop.guard";

jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    readVendorForMember: jest.fn(),
}));

const readVendor = jest.mocked(readVendorForMember);

const vendor = { id: "v1", shopName: "Atelier", slug: "atelier" } as never;

// La requête telle que `SessionGuard` la laisse : la session y est déjà attachée.
const sessionRequest = () => ({ session: { user: { id: "u1" } } }) as Record<string, unknown>;

function contexteHttp(request: Record<string, unknown>): ExecutionContext {
    return {
        getType: () => "http",
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

function contexteGraphql(request: Record<string, unknown>): ExecutionContext {
    const args = [{}, {}, { req: request }, {}];
    return {
        getType: () => "graphql",
        getArgs: () => args,
        getArgByIndex: (index: number) => args[index],
        getClass: () => class {},
        getHandler: () => () => undefined,
    } as unknown as ExecutionContext;
}

describe("ShopGuard", () => {
    beforeEach(() => readVendor.mockReset());

    it("attache la boutique du compte", async () => {
        readVendor.mockResolvedValue(vendor);
        const request = sessionRequest();

        await expect(new ShopGuard().canActivate(contexteHttp(request))).resolves.toBe(true);

        expect(request["shop"]).toEqual({ id: "v1" });
        expect(readVendor).toHaveBeenCalledWith({ marker: "prisma" }, "u1");
    });

    it("refuse un compte sans boutique", async () => {
        readVendor.mockResolvedValue(null);

        await expect(
            new ShopGuard().canActivate(contexteHttp(sessionRequest())),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lit la requête d'un résolveur", async () => {
        readVendor.mockResolvedValue(vendor);
        const request = sessionRequest();

        await new ShopGuard().canActivate(contexteGraphql(request));

        expect(request["shop"]).toEqual({ id: "v1" });
    });
});
