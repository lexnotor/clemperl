import { describe, expect, it } from "vitest";
import { redisConnectionOptions } from "./redis-connection.utils.js";

describe("redisConnectionOptions", () => {
    it("lit l'hôte et le port d'une URL nue", () => {
        expect(redisConnectionOptions("redis://redis:6379")).toEqual({
            host: "redis",
            port: 6379,
            db: 0,
        });
    });

    it("retombe sur le port par défaut quand l'URL n'en porte pas", () => {
        expect(redisConnectionOptions("redis://redis")).toMatchObject({ port: 6379 });
    });

    // Ce que la lecture précédente perdait en silence. Un Redis géré demande presque
    // toujours un mot de passe et du TLS : sans eux, la connexion est refusée en
    // production alors que le développement, sans authentification, ne montre rien.
    it("garde les identifiants", () => {
        expect(redisConnectionOptions("redis://moi:secret@redis:6379")).toMatchObject({
            username: "moi",
            password: "secret",
        });
    });

    it("garde un mot de passe sans nom d'utilisateur", () => {
        expect(redisConnectionOptions("redis://:secret@redis:6379")).toMatchObject({
            password: "secret",
        });
        expect(redisConnectionOptions("redis://:secret@redis:6379").username).toBeUndefined();
    });

    it("garde l'index de base", () => {
        expect(redisConnectionOptions("redis://redis:6379/3")).toMatchObject({ db: 3 });
    });

    // Un chemin qui n'est pas un nombre ne doit pas donner `NaN` comme index : ioredis
    // s'y connecterait à une base indéterminée plutôt que d'échouer franchement.
    it("retombe sur la base 0 quand le chemin n'est pas un nombre", () => {
        expect(redisConnectionOptions("redis://redis:6379/prod")).toMatchObject({ db: 0 });
    });

    // `rediss://` et non `redis://` : une seule lettre, et toute la connexion change.
    it("active TLS pour rediss", () => {
        expect(redisConnectionOptions("rediss://redis:6380")).toMatchObject({ tls: {} });
    });

    it("n'active pas TLS pour redis", () => {
        expect(redisConnectionOptions("redis://redis:6379").tls).toBeUndefined();
    });

    it("refuse une URL illisible plutôt que de se connecter n'importe où", () => {
        expect(() => redisConnectionOptions("pas-une-url")).toThrow();
    });
});
