import { useTranslations } from "next-intl";
import type { JSX } from "react";
import type { IApplicationValues } from "../types/application-values.interface";
import { ApplicationForm } from "./application-form";

type TRejectionReason =
    | "INCOMPLETE_FILE"
    | "UNREADABLE_DOCUMENT"
    | "IDENTITY_MISMATCH"
    | "INELIGIBLE_ACTIVITY"
    | "OTHER";

interface ApplicationRejectedProps {
    reason: TRejectionReason | null;
    comment: string | null;
    values: IApplicationValues;
}

// Le candidat ne voit que la DERNIÈRE décision ; le journal complet est pour
// l'administration, qui en a besoin pour juger, pas lui.
export function ApplicationRejected({
    reason,
    comment,
    values,
}: ApplicationRejectedProps): JSX.Element {
    const t = useTranslations("vendor.application.rejected");
    const tReason = useTranslations("vendor.rejectionReason");

    return (
        <main className="mx-auto max-w-2xl px-6 py-20">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{t("title")}</h1>

            <div className="mt-8 border-l-2 border-accent pl-5">
                {reason !== null && <p className="text-base">{tReason(reason)}</p>}
                {comment !== null && comment !== "" && (
                    <p className="mt-2 text-base text-muet">{comment}</p>
                )}
            </div>

            <p className="mt-8 text-base text-muet">{t("instruction")}</p>

            <ApplicationForm initialValues={values} />
        </main>
    );
}
