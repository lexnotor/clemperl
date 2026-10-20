import { auth } from "@clemperl/auth";
import { documentResponse, readDocument } from "@clemperl/core";
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
    const attachment = await readDisputeAttachmentForBuyer(prisma, {
        attachmentId: id,
        buyerId: session.user.id,
    });
    if (attachment === null) {
        return new Response(null, { status: 404 });
    }

    const content = await readDocument(attachment.objectPath);

    return documentResponse(content, attachment);
}
