import type { auth as InstanceAuth } from "@clemperl/auth";
import { REALTIME_SOCKET_EVENT, type IRealtimeNotice } from "@clemperl/core";
import { listVendorIdsForMember, prisma } from "@clemperl/db";
import { Inject, Logger } from "@nestjs/common";
import type { IoAdapter } from "@nestjs/platform-socket.io";
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from "@nestjs/websockets";
import { AUTH_TOKEN } from "../../auth/guards";
import { allowedOrigins } from "../../payments/utils";
import { appForOrigin, shopRoom, userRoom } from "../utils";

// Les types de socket.io sont pris à l'adaptateur de Nest, et non importés de `socket.io` :
// l'API n'en dépend pas en direct, et ce sont exactement ceux du serveur que Nest construit.
type TIoServer = ReturnType<IoAdapter["createIOServer"]>;
type TIoSocket = Parameters<IoAdapter["bindClientDisconnect"]>[0];

// L'entrée des navigateurs. Le transport websocket SEUL : l'interrogation enchaîne des
// requêtes HTTP qui doivent toutes atteindre le même exemplaire de l'API, ce qui exigerait
// des sessions collantes. Avec ce seul transport, l'option `cors` ne filtre rien : un
// navigateur n'applique pas CORS à une connexion websocket, et Socket.IO ne la lit que pour
// l'interrogation. Le seul filtre des origines est `appForOrigin`, à la poignée de main, qui
// trie aussi la boutique de l'espace vendeur : ne pas compter sur `cors` pour refuser.
@WebSocketGateway({
    cors: { origin: allowedOrigins(process.env), credentials: true },
    transports: ["websocket"],
})
export class RealtimeGateway implements OnGatewayConnection<TIoSocket> {
    private readonly logger = new Logger(RealtimeGateway.name);

    @WebSocketServer()
    server!: TIoServer;

    // Les gardes HTTP ne s'appliquent pas à une poignée de main : la session est demandée
    // ici, à la même instance Better Auth que `SessionGuard`, et de la même manière.
    constructor(@Inject(AUTH_TOKEN) private readonly instance: typeof InstanceAuth) {}

    // Nest ignore la promesse rendue ici : un rejet serait un rejet non capturé, que Node
    // termine par l'arrêt du processus, donc de l'API entière. D'où le `try` : toute erreur
    // devient un refus, et ne pas le retirer.
    async handleConnection(socket: TIoSocket): Promise<void> {
        try {
            const rooms = await this.roomsFor(socket);
            if (rooms === null) {
                socket.disconnect(true);
                return;
            }
            await socket.join(rooms);
        } catch (error) {
            this.logger.error("Poignée de main refusée sur une erreur", error);
            socket.disconnect(true);
        }
    }

    // `null` refuse la connexion. Les salles viennent de la session ET de l'application :
    // la boutique rejoint la salle du compte, l'espace vendeur celle de chaque boutique dont
    // il est membre, jamais l'une et l'autre.
    private async roomsFor(socket: TIoSocket): Promise<string[] | null> {
        // L'origine d'abord : une origine refusée ne coûte pas une lecture de session.
        const app = appForOrigin(socket.handshake.headers.origin, process.env);
        if (app === null) {
            return null;
        }

        // Node joint déjà en une chaîne les en-têtes répétés d'une requête, sauf
        // `set-cookie`, qu'une requête ne porte pas.
        const session = await this.instance.api.getSession({
            headers: new Headers(socket.handshake.headers as Record<string, string>),
        });
        if (!session) {
            return null;
        }

        if (app === "storefront") {
            return [userRoom(session.user.id)];
        }
        const vendorIds = await listVendorIdsForMember(prisma, session.user.id);
        return vendorIds.map(shopRoom);
    }

    emitTo(rooms: string[], notice: IRealtimeNotice): void {
        // Socket.IO lit une liste de salles vide comme « tout le monde » : l'avis partirait
        // vers chaque navigateur connecté. Ne pas retirer ce garde.
        if (rooms.length === 0) {
            return;
        }
        this.server.to(rooms).emit(REALTIME_SOCKET_EVENT, notice);
    }
}
