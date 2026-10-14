"use server";

import { prisma, setShopSuspension } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../lib/session";
import type { ISuspensionState } from "./types/suspension-state.interface";

const ERRORS = messages.errors.shop as Record<string, string>;

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le bouton ne la protège pas.
export async function toggleSuspension(
    _previous: ISuspensionState,
    form: FormData,
): Promise<ISuspensionState> {
    const session = await requireAdministrator();
    const vendorId = String(form.get("vendorId") ?? "");
    // Lu en TROIS états, pas deux. `form.get(...) === "true"` ferait d'un champ absent,
    // renommé ou malformé un RÉTABLISSEMENT, c'est-à-dire la direction qui remet la
    // boutique au catalogue, et l'action rendrait un succès. Un champ qu'on ne sait pas
    // lire se refuse, il ne se devine pas du côté permissif.
    const brut = form.get("suspended");
    if (brut !== "true" && brut !== "false") {
        return { message: [ERRORS["failed"] as string] };
    }
    const suspended = brut === "true";

    // L'existence se vérifie AVANT d'écrire. `setShopSuspension` passe par `updateMany`,
    // qui ne lève pas sur une boutique absente : sans ce contrôle, un identifiant inventé
    // rendrait un succès silencieux.
    const shop = await prisma.vendor.findFirst({
        where: { id: vendorId, deletedAt: null },
        select: { id: true },
    });
    if (!shop) {
        return { message: [ERRORS["not_found"] as string] };
    }

    try {
        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: session.user.id,
            suspended,
        });
    } catch (error) {
        console.error("toggleSuspension", error);
        return { message: [ERRORS["failed"] as string] };
    }

    revalidatePath("/shops");
    return { message: [] };
}
