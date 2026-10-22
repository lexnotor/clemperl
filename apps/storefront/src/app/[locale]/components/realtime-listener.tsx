"use client";

// `@clemperl/core/browser` et non le barillet : celui-ci tire nodemailer et BullMQ, que
// Turbopack ne sait pas assembler pour le navigateur.
import { REALTIME_SOCKET_EVENT, type IRealtimeNotice, type TRealtimeEventKind } from "@clemperl/core/browser";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type JSX } from "react";
import { io } from "socket.io-client";
import { authClient } from "../../../lib/auth-client";

// Le temps de lire une phrase courte. Plus long, une alerte resterait affichée sur une page
// qui a déjà changé sous elle.
export const ALERT_DURATION_MS = 6000;

interface RealtimeListenerProps {
    /** Origine de l'API, lue par la mise en page côté serveur : `process` n'existe pas ici. */
    apiUrl: string;
}

// La clé du catalogue pour un genre. La salle d'un acheteur ne reçoit que ces quatre-là ;
// tout autre genre rend `null`, et la page se rafraîchit sans alerte plutôt que d'afficher
// le chemin d'une clé absente.
function noticeKey(kind: TRealtimeEventKind): string | null {
    switch (kind) {
        case "order.status_changed":
            return "orderStatusChanged";
        case "payment.status_changed":
            return "paymentStatusChanged";
        case "dispute.message_posted":
            return "disputeMessagePosted";
        case "dispute.decided":
            return "disputeDecided";
        default:
            return null;
    }
}

// Une connexion par onglet, posée dans la mise en page : elle survit aux navigations, et
// avertit où que l'on soit dans la boutique. L'avis ne porte rien que la page ne sache
// déjà : on alerte, puis la page relit ses propres données, avec ses propres gardes.
export function RealtimeListener({ apiUrl }: RealtimeListenerProps): JSX.Element | null {
    const router = useRouter();
    const t = useTranslations("realtime");
    const { data: session } = authClient.useSession();
    // L'identifiant du compte et non l'objet : la session relue au retour sur l'onglet est un
    // nouvel objet, et la connexion se refermerait puis se rouvrirait pour le même compte. Et
    // pas un simple « connecté ou non » : un autre compte qui se connecte dans le même onglet
    // passe d'une session à l'autre sans passer par `null`, et la connexion resterait dans la
    // salle du premier, dont il recevrait les alertes.
    const userId = session?.user.id ?? null;
    const [alert, setAlert] = useState<{ id: number; text: string } | null>(null);
    // Chaque avis a son numéro : deux phrases identiques à la suite relancent le délai, et la
    // seconde s'insère à nouveau pour être annoncée.
    const sequence = useRef(0);

    // Hors des dépendances de la connexion : `t` change à chaque rafraîchissement, les
    // catalogues revenant du serveur dans un nouvel objet, et chaque avis fermerait puis
    // rouvrirait la connexion qui vient de le livrer.
    const onNotice = useEffectEvent((notice: IRealtimeNotice) => {
        const key = noticeKey(notice.kind);
        if (key !== null) {
            sequence.current += 1;
            setAlert({ id: sequence.current, text: t(key, { reference: notice.reference ?? "" }) });
        }
        router.refresh();
    });
    const onRefresh = useEffectEvent(() => router.refresh());

    useEffect(() => {
        // Un visiteur sans compte n'a pas de salle : le serveur refuserait la poignée de main.
        // Une adresse vide, celle d'une page prérendue sans `NEXT_PUBLIC_API_URL`, ferait
        // partir `io` vers l'origine de la boutique, qui n'a pas de passerelle, et il y
        // réessaierait sans fin.
        if (userId === null || apiUrl === "") {
            return;
        }
        const socket = io(apiUrl, { withCredentials: true, transports: ["websocket"] });
        // Vrai dès qu'un avis a pu se perdre avant la prochaine connexion : après une
        // connexion, la suivante est une reconnexion ; après une tentative ratée, la page a
        // été rendue sans connexion, et la file livre ce qu'elle a gardé dès le retour de
        // l'API, avant que l'onglet n'ait rejoint sa salle.
        let mayHaveMissed = false;
        socket.on("connect", () => {
            // Une reconnexion, comme une première connexion qui suit des tentatives ratées,
            // rattrape ce qui a pu se perdre sans connexion. Une première connexion réussie
            // d'emblée ne rafraîchit qu'une page qui ATTEND : un avis parti entre son rendu
            // et l'ouverture de la connexion serait perdu, et les autres pages viennent
            // d'être rendues.
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
    }, [apiUrl, userId]);

    useEffect(() => {
        if (alert === null) {
            return;
        }
        const timer = setTimeout(() => setAlert(null), ALERT_DURATION_MS);
        return () => clearTimeout(timer);
    }, [alert]);

    if (userId === null) {
        return null;
    }

    // La région est rendue VIDE avant tout avis : un lecteur d'écran n'annonce que ce qui
    // change dans une région qu'il connaît déjà. Elle flotte au bas de l'écran sans
    // intercepter les clics, pour ne pas masquer un bouton le temps de l'alerte.
    return (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-10 mx-auto flex max-w-6xl justify-end px-6"
        >
            {alert !== null && (
                <p key={alert.id} className="border border-bordure bg-fond px-4 py-3 text-sm">
                    {alert.text}
                </p>
            )}
        </div>
    );
}
