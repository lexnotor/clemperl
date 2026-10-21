// @vitest-environment jsdom
import { E_REALTIME_EVENT } from "@clemperl/core";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const API = "https://api.example.test";
const T = messages.realtime;

const refresh = vi.fn();
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

const { ALERT_DURATION_MS, RealtimeListener } = await import("./realtime-listener");

// Un événement que le serveur pousse. Un écouteur absent fait échouer le test, au lieu de le
// laisser passer sans que rien ne se soit produit.
function serverSends(event: string, payload?: unknown): void {
    const handler = handlers.get(event);
    if (handler === undefined) {
        throw new Error(`aucun écouteur sur « ${event} »`);
    }
    act(() => handler(payload));
}

beforeEach(() => {
    vi.resetAllMocks();
    handlers.clear();
    io.mockReturnValue(socket);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("la connexion de l'espace vendeur", () => {
    // Sans lire la session : chaque page de l'espace exige une appartenance, et le serveur
    // refuse de lui-même une poignée de main sans session.
    it("ouvre une connexion websocket, cookie de session compris, vers l'API", () => {
        render(<RealtimeListener apiUrl={API} />);

        expect(io).toHaveBeenCalledTimes(1);
        expect(io).toHaveBeenCalledWith(API, { withCredentials: true, transports: ["websocket"] });
    });

    // Une page prérendue au build sans `NEXT_PUBLIC_API_URL` reçoit une adresse vide :
    // `io("")` viserait l'origine de l'espace vendeur, qui n'a pas de passerelle, et
    // réessaierait sans fin.
    it("ne se connecte pas sans adresse d'API", () => {
        render(<RealtimeListener apiUrl="" />);

        expect(io).not.toHaveBeenCalled();
    });

    it("garde une seule connexion quand la page se rend à nouveau", () => {
        const { rerender } = render(<RealtimeListener apiUrl={API} />);

        rerender(<RealtimeListener apiUrl={API} />);

        expect(io).toHaveBeenCalledTimes(1);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it("se déconnecte au démontage", () => {
        const { unmount } = render(<RealtimeListener apiUrl={API} />);

        unmount();

        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});

describe("le rafraîchissement à la connexion", () => {
    it("ne rafraîchit pas, à la première connexion, une page qui n'attend rien", () => {
        render(<RealtimeListener apiUrl={API} />);

        serverSends("connect");

        expect(refresh).not.toHaveBeenCalled();
    });

    it("rafraîchit une fois, à la première connexion, une page qui attend", () => {
        render(
            <>
                <div data-realtime-waiting="" hidden />
                <RealtimeListener apiUrl={API} />
            </>,
        );

        serverSends("connect");

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("rafraîchit une fois à chaque reconnexion", () => {
        render(<RealtimeListener apiUrl={API} />);

        serverSends("connect");
        serverSends("connect");

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // La page a été rendue pendant que l'API était injoignable : ce que la file a gardé
    // pendant la coupure part dès le retour de l'API, avant que l'onglet n'ait rejoint ses
    // salles.
    it("rafraîchit une fois quand la connexion aboutit après des tentatives ratées", () => {
        render(<RealtimeListener apiUrl={API} />);

        serverSends("connect_error", new Error("API injoignable"));
        serverSends("connect_error", new Error("API injoignable"));
        serverSends("connect");

        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

describe("l'alerte", () => {
    it("affiche la phrase de l'avis dans une région annoncée, puis rafraîchit la page", () => {
        render(<RealtimeListener apiUrl={API} />);
        // La région existe AVANT l'avis : un lecteur d'écran n'annonce que ce qui change
        // dans une région qu'il connaît déjà.
        const region = screen.getByRole("status");
        expect(region.getAttribute("aria-live")).toBe("polite");
        expect(region.textContent).toBe("");

        serverSends("realtime", { kind: "order.placed", reference: "CP-1" });

        expect(region.textContent).toBe(T.orderPlaced.replace("{reference}", "CP-1"));
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("dit si la photo est prête ou si elle a échoué, avec le titre du produit", () => {
        render(<RealtimeListener apiUrl={API} />);
        const region = screen.getByRole("status");

        serverSends("realtime", {
            kind: "product_image.processed",
            productTitle: "Sac cabas",
            imageStatus: "READY",
        });
        expect(region.textContent).toBe(T.productImageReady.replace("{productTitle}", "Sac cabas"));

        serverSends("realtime", {
            kind: "product_image.processed",
            productTitle: "Sac cabas",
            imageStatus: "FAILED",
        });
        expect(region.textContent).toBe(T.productImageFailed.replace("{productTitle}", "Sac cabas"));
    });

    it("insère le titre tel quel, même quand il ressemble à un motif de remplacement", () => {
        render(<RealtimeListener apiUrl={API} />);

        serverSends("realtime", {
            kind: "product_image.processed",
            productTitle: "Lot $& $1",
            imageStatus: "READY",
        });

        expect(screen.getByRole("status").textContent).toContain("Lot $& $1");
    });

    it("s'efface après quelques secondes", () => {
        vi.useFakeTimers();
        render(<RealtimeListener apiUrl={API} />);
        serverSends("realtime", { kind: "dispute.opened", reference: "CP-3" });
        const region = screen.getByRole("status");

        act(() => vi.advanceTimersByTime(ALERT_DURATION_MS - 1));
        expect(region.textContent).not.toBe("");

        act(() => vi.advanceTimersByTime(1));
        expect(region.textContent).toBe("");
    });

    it("reste le temps de se lire quand un second avis suit le premier", () => {
        vi.useFakeTimers();
        render(<RealtimeListener apiUrl={API} />);
        serverSends("realtime", { kind: "order.placed", reference: "CP-4" });
        act(() => vi.advanceTimersByTime(ALERT_DURATION_MS - 1));

        serverSends("realtime", { kind: "order.placed", reference: "CP-4" });
        act(() => vi.advanceTimersByTime(ALERT_DURATION_MS - 1));

        expect(screen.getByRole("status").textContent).toContain("CP-4");
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("insère à nouveau une phrase identique, pour qu'elle soit annoncée", () => {
        render(<RealtimeListener apiUrl={API} />);
        const region = screen.getByRole("status");
        serverSends("realtime", { kind: "order.placed", reference: "CP-6" });
        const first = region.firstElementChild;

        serverSends("realtime", { kind: "order.placed", reference: "CP-6" });

        expect(region.firstElementChild).not.toBeNull();
        expect(region.firstElementChild).not.toBe(first);
    });

    it("rafraîchit sans alerte sur un genre qu'il ne connaît pas", () => {
        render(<RealtimeListener apiUrl={API} />);

        serverSends("realtime", { kind: "constructor", reference: "CP-5" });

        expect(screen.getByRole("status").textContent).toBe("");
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

// La salle d'une boutique reçoit les huit genres. Les genres attendus se déduisent de
// l'enum, jamais d'une liste recopiée ici : c'est l'ajout d'un genre que ce test doit voir.
describe("le catalogue de l'espace vendeur", () => {
    it.each(Object.values(E_REALTIME_EVENT))("annonce l'avis %s par une phrase complète", (kind) => {
        render(<RealtimeListener apiUrl={API} />);

        serverSends("realtime", {
            kind,
            reference: "CP-9",
            productTitle: "Sac cabas",
            imageStatus: "READY",
        });

        const text = screen.getByRole("status").textContent ?? "";
        expect(text).toMatch(/CP-9|Sac cabas/);
        expect(text).not.toMatch(/[{}]/);
    });
});
