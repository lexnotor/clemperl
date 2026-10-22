// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { FALLBACK_REFRESH_DELAY_MS, ProviderWaitingMarker } = await import(
    "./provider-waiting-marker"
);

function elapse(ms: number): void {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("le marqueur d'une commande qui attend son fournisseur", () => {
    it("pose le marqueur caché que l'écoute du temps réel cherche à sa première connexion", () => {
        const { container } = render(<ProviderWaitingMarker />);

        const marker = container.querySelector("[data-realtime-waiting]");
        expect(marker).not.toBeNull();
        expect(marker?.hasAttribute("hidden")).toBe(true);
    });

    it("ne redemande rien à la page avant la minute", () => {
        render(<ProviderWaitingMarker />);

        elapse(FALLBACK_REFRESH_DELAY_MS - 1);

        expect(refresh).not.toHaveBeenCalled();
    });

    it("redemande la page au serveur une fois, une minute après son affichage", () => {
        render(<ProviderWaitingMarker />);

        elapse(FALLBACK_REFRESH_DELAY_MS);

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // Une page rafraîchie qui attend toujours garde le même composant, qui reçoit un nouveau
    // rendu : reprogrammer ferait du secours une interrogation par intervalles.
    it("ne redemande jamais une seconde fois, même rendu à nouveau", () => {
        const { rerender } = render(<ProviderWaitingMarker />);
        elapse(FALLBACK_REFRESH_DELAY_MS);

        rerender(<ProviderWaitingMarker />);
        elapse(FALLBACK_REFRESH_DELAY_MS * 10);

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // Une page cachée puis réaffichée garde ses composants, et React rejoue alors leurs
    // effets sans les démonter.
    it("ne redemande jamais une seconde fois, même quand son effet est rejoué", () => {
        const { rerender } = render(
            <Activity mode="visible">
                <ProviderWaitingMarker />
            </Activity>,
        );
        elapse(FALLBACK_REFRESH_DELAY_MS);

        rerender(
            <Activity mode="hidden">
                <ProviderWaitingMarker />
            </Activity>,
        );
        rerender(
            <Activity mode="visible">
                <ProviderWaitingMarker />
            </Activity>,
        );
        elapse(FALLBACK_REFRESH_DELAY_MS * 10);

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // Le règlement rend la page sans le marqueur : le composant se démonte avant la minute.
    it("ne redemande rien une fois la page sortie de l'attente", () => {
        const { unmount } = render(<ProviderWaitingMarker />);

        unmount();
        elapse(FALLBACK_REFRESH_DELAY_MS * 2);

        expect(refresh).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
