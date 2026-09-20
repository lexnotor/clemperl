"use server";

import { auth } from "@clemperl/auth";
import { prisma } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { redirect } from "next/navigation";
import type { ISetupState } from "./types/setup-state.interface";

export async function createFirstAdministrator(
    _previous: ISetupState,
    form: FormData,
): Promise<ISetupState> {
    // La SEULE barrière est l'absence d'administrateur, et elle est revérifiée ici, pas
    // seulement au rendu : entre l'affichage du formulaire et sa soumission, un autre
    // amorçage a pu aboutir.
    if ((await prisma.user.count({ where: { role: "ADMIN" } })) > 0) {
        return { message: [messages.errors.setup.already_installed] };
    }

    const email = String(form.get("email"));

    try {
        await auth.api.signUpEmail({
            body: {
                email,
                password: String(form.get("password")),
                name: String(form.get("name")),
            },
        });
    } catch {
        return { message: [messages.errors.setup.failed] };
    }

    // Le rôle et la vérification d'adresse ne s'accordent pas à l'inscription, et c'est
    // heureux : les poser ici est ce qui distingue l'amorçage d'une inscription ordinaire.
    await prisma.user.update({
        where: { email },
        data: { role: "ADMIN", emailVerified: true },
    });

    redirect("/applications");
}
