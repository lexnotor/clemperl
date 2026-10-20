import { auth } from "@clemperl/auth";
import { documentResponse, readDocument } from "@clemperl/core";
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
    const attachment = await readDisputeAttachmentForVendor(prisma, {
        attachmentId: id,
        vendorId: vendor.id,
    });
    if (attachment === null) {
        return new Response(null, { status: 404 });
    }

    const content = await readDocument(attachment.objectPath);

    return documentResponse(content, attachment);
}
