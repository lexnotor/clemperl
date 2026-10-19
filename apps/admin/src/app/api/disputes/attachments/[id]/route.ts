import { readDocument } from "@clemperl/core";
import { prisma, readDisputeAttachmentForAdministration } from "@clemperl/db";
import { requireAdministrator } from "../../../../../lib/session";

// Une route plutôt qu'une URL signée, comme pour les justificatifs de candidature : une URL
// signée est un PORTEUR, et l'autorisation est ici réévaluée à chaque requête.
export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<Response> {
    await requireAdministrator();

    const { id } = await context.params;
    const piece = await readDisputeAttachmentForAdministration(prisma, id);
    if (piece === null) {
        return new Response(null, { status: 404 });
    }

    const content = await readDocument(piece.objectPath);

    return new Response(content, {
        headers: {
            "Content-Type": piece.mimeType,
            // Le nom d'origine est assaini : il vient de l'utilisateur et finit dans un en-tête.
            "Content-Disposition": `inline; filename="${piece.originalName.replace(/[^\w.-]/g, "_")}"`,
            // Le type vient de ce que le navigateur a DÉCLARÉ au dépôt : interdire de le
            // redeviner ferme l'écart entre l'annonce et le contenu réel.
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    });
}
