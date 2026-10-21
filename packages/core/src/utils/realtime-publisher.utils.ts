// `bullmq` entre dans `core` pour qu'un seul dépôt d'événement serve les trois fronts. Le
// risque est un paquet que l'on ne peut plus importer partout : il est écarté, car `core`
// ne s'importe déjà que côté serveur (il porte nodemailer et le client de stockage), et
// `bullmq` y entre à la version exacte que l'API et l'espace vendeur emploient déjà.
import { Queue } from "bullmq";
import { REALTIME_EVENTS_QUEUE } from "../constants/realtime.constant.js";
import type { TRealtimeEvent } from "../interfaces/realtime-event.interface.js";
import { redisConnectionOptions } from "./redis-connection.utils.js";

// UNE file, ouverte une fois pour le processus. Un `new Queue` par appel ouvrirait une
// connexion Redis par requête, et Redis finirait par les refuser.
let queue: Queue | undefined;

function realtimeQueue(): Queue {
    if (!queue) {
        const url = process.env["REDIS_URL"];
        if (!url) {
            throw new Error("REDIS_URL est absente : la file du temps réel est injoignable.");
        }
        queue = new Queue(REALTIME_EVENTS_QUEUE, { connection: redisConnectionOptions(url) });
        // Sans écouteur, BullMQ retombe sur son comportement par défaut pour les erreurs
        // de connexion. Ici elles sont traitées explicitement : journalisées, rien de plus.
        queue.on("error", (error) => console.error("realtimeQueue", error));
    }
    return queue;
}

// Une alerte perdue se rattrape au prochain rechargement de page ; une écriture déjà
// faite ne se défait pas. `removeOn*` : sans elles, BullMQ garde chaque job terminé dans
// Redis, indéfiniment.
const JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
} as const;

// Redis injoignable ne fait pas échouer `add`, il le laisse attendre indéfiniment : le
// client se reconnecte sans fin. Sans borne, l'action qui attend ce dépôt ne rendrait
// jamais la main alors que son écriture est faite. Deux secondes : assez pour un Redis
// lent, court pour une page qui attend. Le dépôt resté en vol peut aboutir plus tard si
// Redis revient : une alerte tardive, jamais une écriture en échec.
const PUBLISH_TIMEOUT_MS = 2000;

// Ne rejette JAMAIS : l'appelant vient d'écrire, et un Redis injoignable ou une
// `REDIS_URL` absente ne doivent pas transformer cette écriture réussie en erreur.
// L'échec est journalisé, puis avalé.
export async function publishRealtimeEvent(event: TRealtimeEvent): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
        const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error("Le dépôt de l'événement temps réel a expiré.")),
                PUBLISH_TIMEOUT_MS,
            );
        });
        await Promise.race([realtimeQueue().add(REALTIME_EVENTS_QUEUE, event, JOB_OPTIONS), deadline]);
    } catch (error) {
        console.error("publishRealtimeEvent", error);
    } finally {
        clearTimeout(timer);
    }
}
