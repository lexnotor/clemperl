import { prisma } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { SetupForm } from "./setup-form";

// Compte la table à chaque rendu : la page doit disparaître à la seconde où un
// administrateur existe.
export const dynamic = "force-dynamic";

export default async function SetupPage(): Promise<JSX.Element> {
    if ((await prisma.user.count({ where: { role: "ADMIN" } })) > 0) {
        notFound();
    }

    const t = messages.setup;

    return (
        <main className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>
            <p className="mt-6 text-base text-muet">{t.instruction}</p>
            <SetupForm />
        </main>
    );
}
