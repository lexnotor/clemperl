"use client";

// `@clemperl/core/browser` et non le barillet : celui-ci tire nodemailer et BullMQ, que
// Turbopack ne sait pas assembler pour le navigateur.
import { REALTIME_SOCKET_EVENT, type IRealtimeNotice } from "@clemperl/core/browser";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type JSX } from "react";
import { io } from "socket.io-client";

const T = messages.realtime;

// Le temps de lire une phrase courte. Plus long, une alerte resterait affichée sur une page
// qui a déjà changé sous elle.
export const ALERT_DURATION_MS = 6000;

interface RealtimeListenerProps {
    /** Origine de l'API, lue par la mise en page côté serveur : `process` n'existe pas ici. */
    apiUrl: string;
}

// La phrase d'un avis, prise au catalogue. Une photo a deux issues, donc deux phrases. Un
// genre que cette page ne connaît pas rend `null` : la page se rafraîchit sans alerte.
function noticeText(notice: IRealtimeNotice): string | null {
    let template: string;
    switch (notice.kind) {
        case "order.placed":
            template = T.orderPlaced;
            break;
        case "order.status_changed":
            template = T.orderStatusChanged;
            break;
        case "payment.status_changed":
            template = T.paymentStatusChanged;
            break;
        case "product_image.processed":
            template = notice.imageStatus === "FAILED" ? T.productImageFailed : T.productImageReady;
            break;
        case "dispute.opened":
            template = T.disputeOpened;
            break;
        case "dispute.message_posted":
            template = T.disputeMessagePosted;
            break;
        case "dispute.decided":
            template = T.disputeDecided;
            break;
        case "dispute.served":
            template = T.disputeServed;
            break;
        default:
            return null;
    }
    // Un remplaçant FONCTION : une chaîne passée telle quelle verrait ses `$&` interprétés,
    // et un titre de produit qui en contient s'afficherait déformé.
    return template
        .replace("{reference}", () => notice.reference ?? "")
        .replace("{productTitle}", () => notice.productTitle ?? "");
}

// Une connexion par onglet, posée dans la mise en page, qui avertit où que l'on soit dans
// l'espace. Elle ne lit pas la session : chaque page exige une appartenance, et le serveur
// refuse de lui-même une poignée de main sans session, sans que le client ne réessaie.
// L'avis ne porte rien que la page ne sache déjà : on alerte, puis la page relit ses
// propres données, avec ses propres gardes.
export function RealtimeListener({ apiUrl }: RealtimeListenerProps): JSX.Element {
    const router = useRouter();
    const [alert, setAlert] = useState<{ id: number; text: string } | null>(null);
    // Chaque avis a son numéro : deux phrases identiques à la suite relancent le délai, et la
    // seconde s'insère à nouveau pour être annoncée.
    const sequence = useRef(0);

    // Hors des dépendances de la connexion, qui ne doit dépendre que de l'adresse de l'API :
    // une connexion refermée puis rouverte à chaque rendu perdrait les avis de l'intervalle.
    const onNotice = useEffectEvent((notice: IRealtimeNotice) => {
        const text = noticeText(notice);
        if (text !== null) {
            sequence.current += 1;
            setAlert({ id: sequence.current, text });
        }
        router.refresh();
    });
    const onRefresh = useEffectEvent(() => router.refresh());

    useEffect(() => {
        // Une adresse vide, celle d'une page prérendue sans `NEXT_PUBLIC_API_URL`, ferait
        // partir `io` vers l'origine de l'espace vendeur, qui n'a pas de passerelle, et il y
        // réessaierait sans fin.
        if (apiUrl === "") {
            return;
        }
        const socket = io(apiUrl, { withCredentials: true, transports: ["websocket"] });
        // Vrai dès qu'un avis a pu se perdre avant la prochaine connexion : après une
        // connexion, la suivante est une reconnexion ; après une tentative ratée, la page a
        // été rendue sans connexion, et la file livre ce qu'elle a gardé dès le retour de
        // l'API, avant que l'onglet n'ait rejoint ses salles.
        let mayHaveMissed = false;
        socket.on("connect", () => {
            // Une reconnexion rattrape ce qui a pu se perdre pendant la coupure. À la première
            // connexion, seule une page qui ATTEND se rafraîchit : un avis parti entre son
            // rendu et l'ouverture de la connexion serait perdu. Les autres pages viennent
            // d'être rendues : l'espace navigue par des liens ordinaires, chaque navigation
            // est un chargement complet, et elle rendrait deux fois.
            if (mayHaveMissed || document.querySelector("[data-realtime-waiting]") !== null) {
                onRefresh();
            }
            mayHaveMissed = true;
        });
        socket.on("connect_error", () => {
            mayHaveMissed = true;
        });
        socket.on(REALTIME_SOCKET_EVENT, (notice: IRealtimeNotice) => onNotice(notice));
        return () => {
            socket.disconnect();
        };
    }, [apiUrl]);

    useEffect(() => {
        if (alert === null) {
            return;
        }
        const timer = setTimeout(() => setAlert(null), ALERT_DURATION_MS);
        return () => clearTimeout(timer);
    }, [alert]);

    // La région est rendue VIDE avant tout avis : un lecteur d'écran n'annonce que ce qui
    // change dans une région qu'il connaît déjà. Elle flotte au bas de l'écran sans
    // intercepter les clics, pour ne pas masquer un bouton le temps de l'alerte.
    return (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-10 mx-auto flex max-w-3xl justify-end px-6"
        >
            {alert !== null && (
                <p key={alert.id} className="border border-bordure bg-fond px-4 py-3 text-sm">
                    {alert.text}
                </p>
            )}
        </div>
    );
}
