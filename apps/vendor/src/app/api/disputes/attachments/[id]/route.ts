import { auth } from "@clemperl/auth";
import { readDocument } from "@clemperl/core";
import { prisma, readDisputeAttachmentForVendor, readVendorForMember } from "@clemperl/db";
import { headers } from "next/headers";

// Une route plutôt qu'une URL signée : une URL signée est un PORTEUR, qui l'a, l'ouvre. Ici
// l'appartenance à la boutique est réévaluée à chaque requête.
//
// `requireVendorMembership` ne convient pas : elle redirige, ce qui n'a pas de sens pour un
// fichier. La même lecture est donc faite ici, et tout refus répond 404, pour ne pas
// confirmer qu'une pièce existe.
export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<Response> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        return new Response(null, { status: 404 });
    }
    const vendor = await readVendorForMember(prisma, session.user.id);
    if (!vendor) {
        return new Response(null, { status: 404 });
    }

    const { id } = await context.params;
    const piece = await readDisputeAttachmentForVendor(prisma, {
        attachmentId: id,
        vendorId: vendor.id,
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
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    });
}
