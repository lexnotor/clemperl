import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// Depuis Prisma 7, le client n'embarque plus de moteur natif : il passe par un
// adaptateur qui pilote le vrai driver PostgreSQL. La chaîne de connexion est donc
// fournie ici, et non plus dans le bloc `datasource` du schéma.
function creerClient(): PrismaClient {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
        throw new Error(
            "DATABASE_URL est absente : le client Prisma ne peut pas ouvrir de connexion.",
        );
    }
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Une seule instance par processus. En développement, le rechargement à chaud réévalue
// les modules et créerait une instance par rechargement : chacune ouvre son pool de
// connexions, et PostgreSQL finit par refuser les nouvelles. L'instance est donc
// accrochée à globalThis, qui survit au rechargement.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let instanceCourante: PrismaClient | undefined;

function instance(): PrismaClient {
    instanceCourante ??= globalForPrisma.prisma ?? creerClient();
    if (process.env["NODE_ENV"] !== "production") {
        globalForPrisma.prisma = instanceCourante;
    }
    return instanceCourante;
}

// Le client se construit à la PREMIÈRE UTILISATION, jamais à l'import. `next build`
// charge le module de chaque page pour y lire sa configuration de rendu : un client
// construit à l'import réclamerait DATABASE_URL au moment de la construction, alors
// qu'aucune requête n'y est faite. Le build échouait sur une base qui n'a pas à exister.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
    get(_cible, propriete) {
        const client = instance();
        const valeur = Reflect.get(client, propriete, client);
        // Les méthodes sont liées au client réel : appelées via le proxy, elles y
        // perdraient leur `this`, et `$transaction` comme `$disconnect` échoueraient.
        return typeof valeur === "function" ? valeur.bind(client) : valeur;
    },
});
