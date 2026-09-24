export interface IRedisConnection {
    host: string;
    port: number;
    db: number;
    username?: string;
    password?: string;
    tls?: Record<string, never>;
}

// L'URL est lue ENTIÈREMENT. N'en garder que l'hôte et le port marche en développement,
// où Redis est nu — et échoue en production, où un Redis géré demande un mot de passe et
// du TLS. La panne arrive alors au démarrage du premier déploiement, loin du changement
// qui l'a causée, et rien dans l'URL de développement ne l'annonçait.
//
// Pure, donc chaque forme d'URL se vérifie sans ouvrir de connexion.
export function redisConnectionOptions(url: string): IRedisConnection {
    const parsed = new URL(url);

    // `pathname` vaut « /3 » pour la base 3, et « / » ou « » quand il n'y en a pas.
    const base = Number(parsed.pathname.slice(1));

    return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        db: Number.isFinite(base) ? base : 0,
        // Une chaîne vide n'est pas un identifiant : la transmettre ferait échouer
        // l'authentification là où son absence laisse passer.
        ...(parsed.username === "" ? {} : { username: decodeURIComponent(parsed.username) }),
        ...(parsed.password === "" ? {} : { password: decodeURIComponent(parsed.password) }),
        // `rediss://` et non `redis://` : une seule lettre, et toute la connexion change.
        ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    };
}
