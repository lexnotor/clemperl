// La réponse d'une pièce privée, écrite UNE fois pour toutes les routes qui en servent :
// recopiés, ces en-têtes divergeraient en silence, et c'est l'un d'eux qui protège.
export function documentResponse(
    content: Blob,
    file: { mimeType: string; originalName: string },
): Response {
    return new Response(content, {
        headers: {
            "Content-Type": file.mimeType,
            // `inline` : la pièce se consulte, elle ne se collectionne pas. Le nom d'origine
            // est assaini : il vient de l'utilisateur et finit dans un en-tête.
            "Content-Disposition": `inline; filename="${file.originalName.replace(/[^\w.-]/g, "_")}"`,
            // Le type vient de ce que le navigateur a DÉCLARÉ au dépôt. Interdire de le
            // redeviner ferme l'écart entre ce qui est annoncé et ce que le fichier contient.
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    });
}
