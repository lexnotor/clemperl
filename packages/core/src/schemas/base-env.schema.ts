import { z } from "zod";

// Validé au démarrage de chaque application. Une variable absente fait échouer le
// boot avec le nom de la variable, plutôt qu'un `undefined` qui se propage et
// explose trois écrans plus loin, loin de sa cause.
export const baseEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    DEV_HOST: z.string().min(1),

    // Secret de signature des sessions. Une valeur absente ferait démarrer
    // l'application avec des sessions non vérifiables, sans rien signaler.
    BETTER_AUTH_SECRET: z.string().min(32),
    SMTP_URL: z.url(),
    EMAIL_FROM: z.string().min(1),

    // Stockage des pièces justificatives. Le bucket est privé : rien n'y est lisible
    // sans la clé de service, qui ne quitte jamais le serveur — mais elle voyage dans un
    // en-tête `Authorization` à chaque requête. En clair sur le réseau, elle est lisible
    // par qui écoute, et avec elle tous les justificatifs. D'où le chiffrement exigé
    // partout sauf en développement, où le service vit sur le réseau Docker.
    STORAGE_URL: z.url(),
    STORAGE_SERVICE_KEY: z.string().min(1),
    STORAGE_BUCKET: z.string().min(1),

    // Le bucket des MÉDIAS, distinct de celui des justificatifs. La séparation est une
    // décision de sécurité, pas du rangement : la route de relais lit un chemin venu de
    // l'URL, et deux buckets rendent IMPOSSIBLE qu'elle serve une pièce d'identité.
    STORAGE_MEDIA_BUCKET: z.string().min(1),


    // Lève l'exigence de chiffrement. Elle existe pour la stack e2e locale, qui monte un
    // build de PRODUCTION contre un stockage vivant sur le réseau Docker — donc le cas
    // que `NODE_ENV === "development"` couvrait, mais sous un autre `NODE_ENV`.
    //
    // Un drapeau explicite plutôt qu'une détection d'hôte « privé » : personne ne
    // l'active par accident, `grep` le retrouve, et celui qui l'écrit assume la décision.
    STORAGE_ALLOW_PLAINTEXT: z.literal("1").optional(),
});

export type TBaseEnv = z.infer<typeof envSchemaWithTls>;

const envSchemaWithTls = baseEnvSchema
    .refine(
        (env) =>
            env.NODE_ENV === "development" ||
            env.STORAGE_ALLOW_PLAINTEXT === "1" ||
            env.STORAGE_URL.startsWith("https://"),
        {
            path: ["STORAGE_URL"],
            message:
                "doit être en https hors développement, sauf si STORAGE_ALLOW_PLAINTEXT vaut 1",
        },
    )
    // Un même bucket pour les médias et les justificatifs ferait de la route de relais
    // un chemin vers les pièces d'identité : elle sert ce que son motif accepte, dans le
    // bucket qu'on lui désigne. La confusion est donc refusée au DÉMARRAGE, où elle coûte
    // un message clair, plutôt qu'à l'exécution, où elle ne coûterait rien du tout.
    .refine((env) => env.STORAGE_MEDIA_BUCKET !== env.STORAGE_BUCKET, {
        path: ["STORAGE_MEDIA_BUCKET"],
        message: "doit être distinct de STORAGE_BUCKET",
    });

export function parseBaseEnv(source: Record<string, string | undefined>): TBaseEnv {
    const result = envSchemaWithTls.safeParse(source);
    if (!result.success) {
        const details = result.error.issues
            .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
        throw new Error(`Environnement invalide :\n${details}`);
    }
    return result.data;
}
