import { readDocument } from "@clemperl/core";
import { prisma } from "@clemperl/db";
import { notFound } from "next/navigation";
import { requireAdministrator } from "../../../../lib/session";

// Un route handler plutôt qu'une URL signée : une URL signée est un PORTEUR — qui l'a,
// l'ouvre — et elle traîne dans l'historique, le presse-papier et les en-têtes
// `Referer`. Ici l'autorisation est réévaluée à chaque requête, et une révocation prend
// effet immédiatement. Le fichier transite par Next, ce qui est sans objet pour trois
// justificatifs lus par une poignée d'administrateurs.
export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<Response> {
    await requireAdministrator();

    const { id } = await context.params;
    const document = await prisma.vendorDocument.findUnique({ where: { id } });

    if (document === null) {
        notFound();
    }

    const content = await readDocument(document.objectPath);

    return new Response(content, {
        headers: {
            "Content-Type": document.mimeType,
            // `inline` : l'administrateur consulte, il ne collectionne pas. Le nom
            // d'origine est assaini — il vient de l'utilisateur et finit dans un en-tête.
            "Content-Disposition": `inline; filename="${document.originalName.replace(/[^\w.-]/g, "_")}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
