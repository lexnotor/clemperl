import { redisConnectionOptions } from "@clemperl/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

// Un événement de la file n'est consommé que par UN exemplaire de l'API, qui ne joint que
// les navigateurs connectés à lui. Cet adaptateur relaie chaque émission par Redis à tous
// les exemplaires : sans lui, un second exemplaire perdrait la moitié des alertes, en silence.
export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: ReturnType<typeof createAdapter> | undefined;

    // N'attend pas Redis : comme BullMQ, les clients se connectent et se reconnectent seuls,
    // et leurs commandes patientent jusque-là. Un Redis absent au démarrage n'empêche donc
    // pas l'API de servir le HTTP.
    async connect(redisUrl: string): Promise<void> {
        // `maxRetriesPerRequest: null` n'est PAS un réglage de confort. Par défaut, ioredis
        // rejette les commandes en attente après vingt tentatives de reconnexion, soit un peu
        // plus d'une minute, et l'adaptateur de socket.io lance ses `publish` et ses
        // abonnements sans jamais capturer leur rejet : un Redis coupé ce temps-là produirait
        // des rejets non capturés, que Node termine par l'arrêt de l'API entière.
        const pub = new Redis({ ...redisConnectionOptions(redisUrl), maxRetriesPerRequest: null });
        const sub = pub.duplicate();
        // Sans écouteur, ioredis imprime chaque erreur de connexion lui-même, et l'adaptateur
        // y ajoute un avertissement ; elles passent ici par le journal que `IoAdapter` porte.
        for (const client of [pub, sub]) {
            client.on("error", (error) => this.logger.error("Redis du temps réel injoignable", error));
        }
        this.adapterConstructor = createAdapter(pub, sub);
    }

    override createIOServer(
        ...args: Parameters<IoAdapter["createIOServer"]>
    ): ReturnType<IoAdapter["createIOServer"]> {
        // Un serveur créé sans adaptateur fonctionnerait seul, et c'est précisément la panne
        // silencieuse que cette classe existe pour empêcher : refuser plutôt.
        if (this.adapterConstructor === undefined) {
            throw new Error("RedisIoAdapter : connect() doit précéder la création du serveur.");
        }
        const server = super.createIOServer(...args);
        server.adapter(this.adapterConstructor);
        return server;
    }
}
