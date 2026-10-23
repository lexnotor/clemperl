// La requête telle que `SessionGuard` la laisse : la session y est attachée, et ne se lit
// qu'après lui. Seuls les champs dont un appelant se sert sont typés.
export interface ISessionRequest {
    session: { user: { id: string; email: string; name: string } };
}
