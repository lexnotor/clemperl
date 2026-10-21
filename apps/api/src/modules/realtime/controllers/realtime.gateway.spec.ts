import { REALTIME_SOCKET_EVENT } from "@clemperl/core";
import { listVendorIdsForMember, prisma } from "@clemperl/db";
import { Logger } from "@nestjs/common";
import { GATEWAY_OPTIONS } from "@nestjs/websockets/constants";
import { RealtimeGateway } from "./realtime.gateway";

// Le dépôt est remplacé ; Better Auth et le serveur Socket.IO sont des substituts passés à la
// main, la passerelle ne les construisant pas.
jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    listVendorIdsForMember: jest.fn(),
}));

const ORIGINS = {
    NEXT_PUBLIC_STOREFRONT_URL: "http://storefront.test",
    NEXT_PUBLIC_VENDOR_URL: "http://vendor.test",
    NEXT_PUBLIC_ADMIN_URL: "http://admin.test",
};

const SESSION = { user: { id: "user-1" } };

function fakeSocket(headers: Record<string, string>) {
    return { handshake: { headers }, join: jest.fn(), disconnect: jest.fn() };
}

function build(getSession: jest.Mock = jest.fn().mockResolvedValue(SESSION)) {
    return { getSession, gateway: new RealtimeGateway({ api: { getSession } } as never) };
}

// Toutes les salles rejointes, qu'elles l'aient été une à une ou par liste.
function joinedRooms(socket: ReturnType<typeof fakeSocket>): string[] {
    return socket.join.mock.calls.flatMap(([rooms]: [string | string[]]) => [rooms].flat());
}

const saved = { ...process.env };

beforeAll(() => {
    Object.assign(process.env, ORIGINS);
});

afterAll(() => {
    process.env = saved;
});

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("RealtimeGateway, la déclaration", () => {
    // Le transport par interrogation enchaîne plusieurs requêtes HTTP qui doivent toutes
    // atteindre le MÊME exemplaire de l'API : il exigerait des sessions collantes.
    it("n'accepte que le transport websocket, avec le cookie de session", () => {
        const options = Reflect.getMetadata(GATEWAY_OPTIONS, RealtimeGateway);

        expect(options.transports).toEqual(["websocket"]);
        expect(options.cors.credentials).toBe(true);
    });
});

describe("RealtimeGateway.handleConnection, le refus", () => {
    it.each([
        ["l'administration", { origin: "http://admin.test" }],
        ["une origine inconnue", { origin: "http://elsewhere.test" }],
        ["une poignée de main sans origine", {}],
    ])("refuse %s, sans rejoindre de salle, même avec une session", async (_, origin) => {
        const { gateway } = build();
        const socket = fakeSocket({ ...origin, cookie: "session=valid" });

        await gateway.handleConnection(socket as never);

        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.join).not.toHaveBeenCalled();
    });

    it.each([
        ["de la boutique", ORIGINS.NEXT_PUBLIC_STOREFRONT_URL],
        ["de l'espace vendeur", ORIGINS.NEXT_PUBLIC_VENDOR_URL],
    ])("refuse une connexion %s sans session", async (_, origin) => {
        const { gateway } = build(jest.fn().mockResolvedValue(null));
        const socket = fakeSocket({ origin });

        await gateway.handleConnection(socket as never);

        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.join).not.toHaveBeenCalled();
    });

    // Nest ignore la promesse rendue par `handleConnection` : un rejet y serait un rejet non
    // capturé, et Node arrêterait le processus, donc l'API entière.
    it("refuse sans rejeter quand la session ne peut pas être lue", async () => {
        const { gateway } = build(jest.fn().mockRejectedValue(new Error("base coupée")));
        const socket = fakeSocket({ origin: ORIGINS.NEXT_PUBLIC_STOREFRONT_URL });

        await expect(gateway.handleConnection(socket as never)).resolves.toBeUndefined();

        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.join).not.toHaveBeenCalled();
        expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it("refuse sans rejeter quand les boutiques du compte ne peuvent pas être lues", async () => {
        jest.mocked(listVendorIdsForMember).mockRejectedValue(new Error("base coupée"));
        const { gateway } = build();
        const socket = fakeSocket({ origin: ORIGINS.NEXT_PUBLIC_VENDOR_URL });

        await expect(gateway.handleConnection(socket as never)).resolves.toBeUndefined();

        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.join).not.toHaveBeenCalled();
    });
});

describe("RealtimeGateway.handleConnection, les salles", () => {
    it("demande la session à Better Auth avec les en-têtes de la poignée de main", async () => {
        const { gateway, getSession } = build();
        const socket = fakeSocket({
            origin: ORIGINS.NEXT_PUBLIC_STOREFRONT_URL,
            cookie: "session=valid",
        });

        await gateway.handleConnection(socket as never);

        const { headers } = getSession.mock.calls[0][0] as { headers: Headers };
        expect(headers.get("cookie")).toBe("session=valid");
    });

    // UN MÊME COMPTE, membre de deux boutiques, connecté aux deux fronts : la session ne dit
    // pas d'où il se connecte, l'origine si. Son onglet de la boutique ne reçoit rien de ses
    // boutiques, son onglet vendeur rien de ses achats.
    it("depuis la boutique, le compte rejoint sa salle et aucune salle de boutique", async () => {
        jest.mocked(listVendorIdsForMember).mockResolvedValue(["vendor-1", "vendor-2"]);
        const { gateway } = build();
        const socket = fakeSocket({ origin: ORIGINS.NEXT_PUBLIC_STOREFRONT_URL });

        await gateway.handleConnection(socket as never);

        expect(joinedRooms(socket)).toEqual(["user:user-1"]);
        expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it("depuis l'espace vendeur, le compte rejoint chacune de ses boutiques et pas sa salle", async () => {
        jest.mocked(listVendorIdsForMember).mockResolvedValue(["vendor-1", "vendor-2"]);
        const { gateway } = build();
        const socket = fakeSocket({ origin: ORIGINS.NEXT_PUBLIC_VENDOR_URL });

        await gateway.handleConnection(socket as never);

        expect(listVendorIdsForMember).toHaveBeenCalledWith(prisma, "user-1");
        expect(joinedRooms(socket)).toEqual(["shop:vendor-1", "shop:vendor-2"]);
        expect(socket.disconnect).not.toHaveBeenCalled();
    });
});

describe("RealtimeGateway.emitTo", () => {
    function withServer() {
        const emit = jest.fn();
        const to = jest.fn(() => ({ emit }));
        const { gateway } = build();
        gateway.server = { to } as never;
        return { gateway, to, emit };
    }

    it("émet l'avis vers les salles désignées", () => {
        const { gateway, to, emit } = withServer();
        const notice = { kind: "order.placed", reference: "CP-1" } as const;

        gateway.emitTo(["shop:vendor-1", "user:user-1"], notice);

        expect(to).toHaveBeenCalledWith(["shop:vendor-1", "user:user-1"]);
        expect(emit).toHaveBeenCalledWith(REALTIME_SOCKET_EVENT, notice);
    });

    // Socket.IO lit une liste de salles vide comme « tout le monde » : l'avis partirait vers
    // chaque navigateur connecté, quel que soit son compte.
    it("n'émet rien sans salle", () => {
        const { gateway, to } = withServer();

        gateway.emitTo([], { kind: "order.placed", reference: "CP-1" });

        expect(to).not.toHaveBeenCalled();
    });
});
