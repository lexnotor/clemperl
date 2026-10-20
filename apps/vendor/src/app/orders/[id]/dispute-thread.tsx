import type { TDisputeMessage } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import type { JSX } from "react";

const T = messages.disputes;
const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

interface DisputeThreadProps {
    messages: readonly TDisputeMessage[];
}

// Le fil, du plus ancien au plus récent. Les pièces passent par la route gardée de l'espace
// vendeur, jamais par une URL du stockage.
export function DisputeThread({ messages: thread }: DisputeThreadProps): JSX.Element {
    return (
        <ol className="mt-6 flex flex-col gap-6">
            {thread.map((message) => (
                <li key={message.id} data-testid="dispute-message" className="border-l-2 border-bordure pl-4">
                    <p className="text-muet">
                        {T.party[message.party]} · {DATE.format(message.createdAt)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{message.body}</p>
                    {message.attachments.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1" aria-label={T.attachmentsOf}>
                            {message.attachments.map((attachment) => (
                                <li key={attachment.id}>
                                    <a href={`/api/disputes/attachments/${attachment.id}`} className="underline">
                                        {attachment.originalName}
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
