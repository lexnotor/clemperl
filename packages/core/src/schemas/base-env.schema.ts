import { z } from "zod";

// Validé au démarrage de chaque application. Une variable absente fait échouer le
// boot avec le nom de la variable, plutôt qu'un `undefined` qui se propage et
// explose trois écrans plus loin, loin de sa cause.
export const baseEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    DEV_HOST: z.string().min(1),
});

export type TBaseEnv = z.infer<typeof baseEnvSchema>;

export function parseBaseEnv(source: Record<string, string | undefined>): TBaseEnv {
    const resultat = baseEnvSchema.safeParse(source);
    if (!resultat.success) {
        const details = resultat.error.issues
            .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
        throw new Error(`Environnement invalide :\n${details}`);
    }
    return resultat.data;
}
