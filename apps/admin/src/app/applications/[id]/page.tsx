import { prisma, readFullApplication } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireAdministrator } from "../../../lib/session";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

function Line({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="flex justify-between gap-6 border-b border-bordure py-3">
            <span className="text-sm text-muet">{label}</span>
            <span className="text-right text-base">{value}</span>
        </div>
    );
}

export default async function ApplicationPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    await requireAdministrator();
    const { id } = await params;
    const application = await readFullApplication(prisma, id);

    if (application === null) {
        notFound();
    }

    const t = messages.application;
    const kinds = messages.vendor.documentKind as Record<string, string>;
    const reasons = messages.vendor.rejectionReason as Record<string, string>;
    const categories = messages.vendor.category as Record<string, string>;

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <Link href="/applications" className="text-sm text-muet hover:text-texte">
                {t.back}
            </Link>
            <h1 className="mt-4 font-titre text-4xl tracking-tight">{application.shopName}</h1>
            <p className="mt-2 text-sm text-muet">
                {t.submittedOn} {DATE.format(application.submittedAt)} · {application.applicant.email}
            </p>

            <section className="mt-10">
                <h2 className="font-titre text-xl">{t.declared}</h2>
                <div className="mt-4 border-t border-bordure">
                    <Line label={t.description} value={application.shopDescription} />
                    <Line label={t.contact} value={`${application.contactEmail} · ${application.contactPhone}`} />
                    <Line
                        label={t.categories}
                        value={application.categories.map((c) => categories[c] ?? c).join(", ")}
                    />
                    <Line label={t.legalForm} value={application.legalForm} />
                    <Line label={t.legalName} value={application.legalName} />
                    <Line label={t.registrationNumber} value={application.registrationNumber} />
                    <Line label={t.taxNumber} value={application.taxNumber ?? "—"} />
                    <Line label={t.country} value={application.country} />
                </div>
            </section>

            <section className="mt-10">
                <h2 className="font-titre text-xl">{t.documents}</h2>
                <ul className="mt-4 border-t border-bordure">
                    {application.documents.map((document) => (
                        <li
                            key={document.id}
                            className="flex items-center justify-between gap-6 border-b border-bordure py-3"
                        >
                            <span className="text-sm text-muet">{kinds[document.kind]}</span>
                            <a
                                href={`/api/documents/${document.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-base underline underline-offset-4"
                            >
                                {document.originalName}
                            </a>
                        </li>
                    ))}
                </ul>
            </section>

            {application.decisions.length > 0 && (
                <section className="mt-10">
                    <h2 className="font-titre text-xl">{t.journal}</h2>
                    <ul className="mt-4 border-t border-bordure">
                        {application.decisions.map((decision) => (
                            <li key={decision.id} className="border-b border-bordure py-3">
                                <p className="text-base">
                                    {decision.decision === "ACCEPTED" ? t.approved : t.rejected}
                                    {decision.reason !== null && ` — ${reasons[decision.reason]}`}
                                </p>
                                {decision.comment !== null && decision.comment !== "" && (
                                    <p className="mt-1 text-sm text-muet">{decision.comment}</p>
                                )}
                                <p className="mt-1 text-sm text-muet">
                                    {DATE.format(decision.createdAt)} · {decision.decidedBy.email}
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {application.status === "SUBMITTED" && <DecisionForm applicationId={application.id} />}
        </main>
    );
}
