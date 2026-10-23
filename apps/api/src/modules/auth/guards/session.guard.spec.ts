import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AUTH_TOKEN, SessionGuard } from "./session.guard";

function contexteAvecEnTetes(entetes: Record<string, string>): ExecutionContext {
    return {
        getType: () => "http",
        switchToHttp: () => ({ getRequest: () => ({ headers: entetes }) }),
    } as unknown as ExecutionContext;
}

// Un résolveur GraphQL reçoit ses arguments dans l'ordre racine, arguments, contexte,
// informations : la requête Express est dans le contexte, au troisième rang.
// `GqlExecutionContext.create` relit aussi la classe et la méthode visées.
function contexteGraphql(request: Record<string, unknown>): ExecutionContext {
    const args = [{}, {}, { req: request }, {}];
    return {
        getType: () => "graphql",
        getArgs: () => args,
        getArgByIndex: (index: number) => args[index],
        getClass: () => class {},
        getHandler: () => () => undefined,
    } as unknown as ExecutionContext;
}

describe("SessionGuard", () => {
    it("se laisse construire par Nest quand l'instance est fournie sous son jeton", async () => {
        // `@UseGuards(SessionGuard)` fait construire le garde par Nest, qui résout le
        // constructeur. Une instance passée par `useValue` sur la classe elle-même ne
        // servirait jamais, et l'injection échouerait au premier appel protégé, donc
        // à l'exécution, pas ici. Ce test tient cette forme d'injection en place.
        const module = await Test.createTestingModule({
            providers: [
                SessionGuard,
                { provide: AUTH_TOKEN, useValue: { api: { getSession: async () => null } } },
            ],
        }).compile();

        expect(module.get(SessionGuard)).toBeInstanceOf(SessionGuard);
    });

    it("refuse une requête sans cookie de session", async () => {
        const garde = new SessionGuard({ api: { getSession: async () => null } } as never);

        await expect(garde.canActivate(contexteAvecEnTetes({}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it("accepte une requête dont la session est valide", async () => {
        const garde = new SessionGuard({
            api: { getSession: async () => ({ user: { id: "u1", email: "a@b.test" } }) },
        } as never);

        await expect(
            garde.canActivate(contexteAvecEnTetes({ cookie: "session=x" })),
        ).resolves.toBe(true);
    });

    it("attache la session à la requête pour les contrôleurs", async () => {
        const garde = new SessionGuard({
            api: { getSession: async () => ({ user: { id: "u1", email: "a@b.test" } }) },
        } as never);
        const request: Record<string, unknown> = { headers: { cookie: "session=x" } };
        const contexte = {
            getType: () => "http",
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext;

        await garde.canActivate(contexte);

        // Sans cela, chaque contrôleur redemanderait à la base ce qui vient d'être
        // vérifié, à chaque requête.
        expect(request["session"]).toEqual({ user: { id: "u1", email: "a@b.test" } });
    });

    it("accepte une requête GraphQL dont la session est valide, et l'y attache", async () => {
        const garde = new SessionGuard({
            api: { getSession: async () => ({ user: { id: "u1", email: "a@b.test" } }) },
        } as never);
        const request: Record<string, unknown> = { headers: { cookie: "session=x" } };

        await expect(garde.canActivate(contexteGraphql(request))).resolves.toBe(true);
        // Le résolveur lit la session là, comme un contrôleur : sans elle, il n'aurait
        // aucun compte à qui rendre sa boutique.
        expect(request["session"]).toEqual({ user: { id: "u1", email: "a@b.test" } });
    });

    it("refuse une requête GraphQL sans session", async () => {
        const garde = new SessionGuard({ api: { getSession: async () => null } } as never);

        await expect(
            garde.canActivate(contexteGraphql({ headers: {} })),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
