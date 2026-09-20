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
});

export type TBaseEnv = z.infer<typeof envSchemaWithTls>;

const envSchemaWithTls = baseEnvSchema.refine(
    (env) => env.NODE_ENV === "development" || env.STORAGE_URL.startsWith("https://"),
    { path: ["STORAGE_URL"], message: "doit être en https hors développement" },
);

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
