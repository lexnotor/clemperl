import { auth } from "@clemperl/auth";
import { readDocument } from "@clemperl/core";
import { prisma, readDisputeAttachmentForBuyer } from "@clemperl/db";
import { headers } from "next/headers";

// Une route plutôt qu'une URL signée : une URL signée est un PORTEUR, qui l'a, l'ouvre, et
// une preuve montre souvent un domicile, un nom, une adresse. Ici la garde est réévaluée à
// chaque requête.
//
// 404 dans tous les refus, session absente comprise : répondre « interdit » confirmerait que
// la pièce existe, et rediriger vers la connexion n'a pas de sens pour une image intégrée.
export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<Response> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        return new Response(null, { status: 404 });
    }

    const { id } = await context.params;
    const piece = await readDisputeAttachmentForBuyer(prisma, {
        attachmentId: id,
        buyerId: session.user.id,
    });
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
