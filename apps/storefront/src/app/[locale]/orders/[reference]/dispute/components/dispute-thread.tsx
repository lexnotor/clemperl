import { getFormatter, getTranslations } from "next-intl/server";
import type { JSX } from "react";

interface DisputeThreadProps {
    messages: readonly {
        id: string;
        party: string;
        body: string;
        createdAt: Date;
        attachments: readonly { id: string; originalName: string }[];
    }[];
}

// Le fil, du plus ancien au plus récent. Les pièces passent par la route gardée de la
// boutique, jamais par une URL du stockage.
export async function DisputeThread({ messages }: DisputeThreadProps): Promise<JSX.Element> {
    const t = await getTranslations("disputes");
    const format = await getFormatter();

    return (
        <ol className="mt-10 flex flex-col gap-8">
            {messages.map((message) => (
                <li key={message.id} data-testid="dispute-message" className="border-l-2 border-bordure pl-4">
                    <p className="text-sm text-muet">
                        {t(`party.${message.party}` as never)} ·{" "}
                        {format.dateTime(message.createdAt, { dateStyle: "long", timeStyle: "short" })}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
                    {message.attachments.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1 text-sm" aria-label={t("attachmentsOf")}>
                            {message.attachments.map((piece) => (
                                <li key={piece.id}>
                                    <a href={`/api/disputes/attachments/${piece.id}`} className="underline">
                                        {piece.originalName}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </li>
            ))}
        </ol>
    );
}
