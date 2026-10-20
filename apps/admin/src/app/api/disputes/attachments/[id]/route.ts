import { documentResponse, readDocument } from "@clemperl/core";
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
    const attachment = await readDisputeAttachmentForAdministration(prisma, id);
    if (attachment === null) {
        return new Response(null, { status: 404 });
    }

    const content = await readDocument(attachment.objectPath);

    return documentResponse(content, attachment);
}
