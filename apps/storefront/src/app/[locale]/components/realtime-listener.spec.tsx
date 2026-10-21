// @vitest-environment jsdom
import en from "@clemperl/i18n/messages/storefront/en.json";
import fr from "@clemperl/i18n/messages/storefront/fr.json";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const API = "https://api.example.test";

const refresh = vi.fn();
const useSession = vi.fn();
const io = vi.fn();
const disconnect = vi.fn();

// Les écouteurs que le composant pose sur la connexion, par nom d'événement : le test les
// déclenche comme le ferait le serveur.
const handlers = new Map<string, (payload?: unknown) => void>();
const socket = {
    on: (event: string, handler: (payload?: unknown) => void) => {
        handlers.set(event, handler);
        return socket;
    },
    disconnect: () => disconnect(),
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("socket.io-client", () => ({ io: (...args: unknown[]) => io(...args) }));
vi.mock("../../../lib/auth-client", () => ({
    authClient: { useSession: () => useSession() },
}));

const { ALERT_DURATION_MS, RealtimeListener } = await import("./realtime-listener");

function withIntl(children: ReactNode, catalog: typeof fr = fr, locale = "fr"): ReactNode {
    return (
        <NextIntlClientProvider locale={locale} messages={catalog} timeZone="Europe/Paris">
            {children}
        </NextIntlClientProvider>
    );
}

// Un événement que le serveur pousse. Un écouteur absent fait échouer le test, au lieu de le
// laisser passer sans que rien ne se soit produit.
function serverSends(event: string, payload?: unknown): void {
    const handler = handlers.get(event);
    if (handler === undefined) {
        throw new Error(`aucun écouteur sur « ${event} »`);
    }
    act(() => handler(payload));
}

function signedIn(): void {
    useSession.mockReturnValue({ data: { user: { id: "u1" }, session: { id: "s1" } } });
}

beforeEach(() => {
    vi.resetAllMocks();
    handlers.clear();
    io.mockReturnValue(socket);
    signedIn();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("la connexion de la boutique", () => {
    it("ne se connecte pas sans session, et ne pose aucune région d'alerte", () => {
        useSession.mockReturnValue({ data: null });

        render(withIntl(<RealtimeListener apiUrl={API} />));

        expect(io).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("ouvre une connexion websocket, cookie de session compris, vers l'API", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));

        expect(io).toHaveBeenCalledTimes(1);
        expect(io).toHaveBeenCalledWith(API, { withCredentials: true, transports: ["websocket"] });
    });

    // Une page prérendue au build sans `NEXT_PUBLIC_API_URL` reçoit une adresse vide :
    // `io("")` viserait l'origine de la boutique, qui n'a pas de passerelle, et réessaierait
    // sans fin.
    it("ne se connecte pas sans adresse d'API", () => {
        render(withIntl(<RealtimeListener apiUrl="" />));

        expect(io).not.toHaveBeenCalled();
    });

    it("garde une seule connexion quand la page se rend à nouveau", () => {
        const { rerender } = render(withIntl(<RealtimeListener apiUrl={API} />));
        // Un rafraîchissement rend un NOUVEL objet de catalogue, et la session relue au
        // retour sur l'onglet un nouvel objet de session, pour le même compte.
        signedIn();
        rerender(withIntl(<RealtimeListener apiUrl={API} />, structuredClone(fr)));

        expect(io).toHaveBeenCalledTimes(1);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it("se déconnecte au démontage", () => {
        const { unmount } = render(withIntl(<RealtimeListener apiUrl={API} />));

        unmount();

        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("change de connexion quand un autre compte se connecte dans le même onglet", () => {
        const { rerender } = render(withIntl(<RealtimeListener apiUrl={API} />));
        // La connexion d'un autre compte passe d'une session à l'autre sans jamais passer par
        // `null` : la salle du premier compte ne doit pas survivre à ce changement.
        useSession.mockReturnValue({ data: { user: { id: "u2" }, session: { id: "s2" } } });

        rerender(withIntl(<RealtimeListener apiUrl={API} />));

        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(io).toHaveBeenCalledTimes(2);
    });

    it("se déconnecte quand la session se ferme", () => {
        const { rerender } = render(withIntl(<RealtimeListener apiUrl={API} />));
        useSession.mockReturnValue({ data: null });

        rerender(withIntl(<RealtimeListener apiUrl={API} />));

        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});

describe("le rafraîchissement à la connexion", () => {
    it("ne rafraîchit pas, à la première connexion, une page qui n'attend rien", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));

        serverSends("connect");

        expect(refresh).not.toHaveBeenCalled();
    });

    it("rafraîchit une fois, à la première connexion, une page qui attend", () => {
        render(
            withIntl(
                <>
                    <div data-realtime-waiting="" hidden />
                    <RealtimeListener apiUrl={API} />
                </>,
            ),
        );

        serverSends("connect");

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("rafraîchit une fois à chaque reconnexion", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));

        serverSends("connect");
        serverSends("connect");

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // La page a été rendue pendant que l'API était injoignable : ce que la file a gardé
    // pendant la coupure part dès le retour de l'API, avant que l'onglet n'ait rejoint sa
    // salle.
    it("rafraîchit une fois quand la connexion aboutit après des tentatives ratées", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));

        serverSends("connect_error", new Error("API injoignable"));
        serverSends("connect_error", new Error("API injoignable"));
        serverSends("connect");

        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

describe("l'alerte", () => {
    it("affiche la phrase de l'avis dans une région annoncée, puis rafraîchit la page", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));
        // La région existe AVANT l'avis : un lecteur d'écran n'annonce que ce qui change
        // dans une région qu'il connaît déjà.
        const region = screen.getByRole("status");
        expect(region.getAttribute("aria-live")).toBe("polite");
        expect(region.textContent).toBe("");

        serverSends("realtime", { kind: "order.status_changed", reference: "CP-1" });

        expect(region.textContent).toBe(
            fr.realtime.orderStatusChanged.replace("{reference}", "CP-1"),
        );
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("parle la langue de la personne", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />, en, "en"));

        serverSends("realtime", { kind: "payment.status_changed", reference: "CP-2" });

        expect(screen.getByRole("status").textContent).toBe(
            en.realtime.paymentStatusChanged.replace("{reference}", "CP-2"),
        );
    });

    it("s'efface après quelques secondes", () => {
        vi.useFakeTimers();
        render(withIntl(<RealtimeListener apiUrl={API} />));
        serverSends("realtime", { kind: "dispute.decided", reference: "CP-3" });
        const region = screen.getByRole("status");

        act(() => vi.advanceTimersByTime(ALERT_DURATION_MS - 1));
        expect(region.textContent).not.toBe("");

        act(() => vi.advanceTimersByTime(1));
        expect(region.textContent).toBe("");
    });

    it("reste le temps de se lire quand un second avis suit le premier", () => {
        vi.useFakeTimers();
        render(withIntl(<RealtimeListener apiUrl={API} />));
        serverSends("realtime", { kind: "order.status_changed", reference: "CP-4" });
        act(() => vi.advanceTimersByTime(ALERT_DURATION_MS - 1));

        serverSends("realtime", { kind: "order.status_changed", reference: "CP-4" });
        act(() => vi.advanceTimersByTime(ALERT_DURATION_MS - 1));

        expect(screen.getByRole("status").textContent).toContain("CP-4");
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("insère à nouveau une phrase identique, pour qu'elle soit annoncée", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));
        const region = screen.getByRole("status");
        serverSends("realtime", { kind: "order.status_changed", reference: "CP-6" });
        const first = region.firstElementChild;

        serverSends("realtime", { kind: "order.status_changed", reference: "CP-6" });

        expect(region.firstElementChild).not.toBeNull();
        expect(region.firstElementChild).not.toBe(first);
    });

    it("rafraîchit sans alerte sur un genre que la boutique ne reçoit pas", () => {
        render(withIntl(<RealtimeListener apiUrl={API} />));

        serverSends("realtime", { kind: "order.placed", reference: "CP-5" });

        expect(screen.getByRole("status").textContent).toBe("");
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

// Les quatre genres que la salle d'un acheteur reçoit. Une clé absente ne casse rien au
// build : next-intl rendrait le chemin de la clé à l'écran, au milieu de l'alerte.
describe.each([
    ["fr", fr],
    ["en", en],
])("le catalogue %s", (locale, catalog) => {
    it.each(["order.status_changed", "payment.status_changed", "dispute.message_posted", "dispute.decided"])(
        "annonce l'avis %s par une phrase complète, référence comprise",
        (kind) => {
            render(withIntl(<RealtimeListener apiUrl={API} />, catalog, locale));

            serverSends("realtime", { kind, reference: "CP-9" });

            const text = screen.getByRole("status").textContent ?? "";
            expect(text).toContain("CP-9");
            expect(text).not.toContain("realtime.");
            expect(text).not.toMatch(/[{}]/);
        },
    );
});
