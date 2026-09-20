import { prisma, readApplicantApplication } from "@clemperl/db";
import { getTranslations } from "next-intl/server";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../../lib/session";
import { ApplicationApproved } from "./components/application-approved";
import { ApplicationForm } from "./components/application-form";
import { ApplicationUnderReview } from "./components/application-under-review";

// Une seule adresse, plusieurs états. Deux routes obligeraient un lien de navigation à
// deviner laquelle proposer, et l'une des deux répondrait « rien à voir ici ».
export default async function BecomeAVendorPage(): Promise<JSX.Element> {
    const session = await requireVerifiedSession("/become-a-vendor");
    const t = await getTranslations("vendor.application");
    const application = await readApplicantApplication(prisma, session.user.id);

    if (application?.status === "ACCEPTED") {
        return <ApplicationApproved shopName={application.shopName} />;
    }

    if (application?.status === "SUBMITTED") {
        return <ApplicationUnderReview since={application.submittedAt} />;
    }

    return (
        <main className="mx-auto max-w-2xl px-6 py-20">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{t("title")}</h1>
            <p className="mt-6 max-w-lg text-base text-muet">{t("documentsToPrepare")}</p>
            <ApplicationForm />
        </main>
    );
}
