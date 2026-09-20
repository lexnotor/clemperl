import { listSubmittedApplications, prisma } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import Link from "next/link";
import type { JSX } from "react";
import { requireAdministrator } from "../../lib/session";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long" });

export default async function ApplicationsPage(): Promise<JSX.Element> {
    await requireAdministrator();
    const t = messages.applications;
    const applications = await listSubmittedApplications(prisma);

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>

            {applications.length === 0 ? (
                <p className="mt-8 border-t border-bordure pt-8 text-base text-muet">
                    {t.empty}
                </p>
            ) : (
                <ul className="mt-8 border-t border-bordure">
                    {applications.map((application) => (
                        <li key={application.id} className="border-b border-bordure">
                            <Link
                                href={`/applications/${application.id}`}
                                className="flex flex-col gap-1 py-5 hover:bg-bordure/20"
                            >
                                <span className="font-titre text-lg">{application.shopName}</span>
                                <span className="text-sm text-muet">
                                    {application.legalName} · {application.country} ·{" "}
                                    {DATE.format(application.submittedAt)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
