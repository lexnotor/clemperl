// Ce que les parcours lisent du temps réel : l'alerte, la connexion, et la preuve qu'une page
// a changé sans être rechargée.
import { expect, type Locator, type Page } from "@playwright/test";

// Un avis traverse une écriture, l'API, puis un nouveau rendu de la page qui le reçoit : plus
// que les cinq secondes par défaut sur une machine chargée. Allonger ne masque rien : sans
// l'avis, la page ne changerait jamais.
export const AFTER_EVENT = { timeout: 30_000 };

// L'alerte du temps réel. Sa région est posée par la mise en page, HORS de `main`, et c'est
// ce qui la distingue du retour propre à une page, comme « Ajouté à votre panier », lui aussi
// `role="status"` mais dans `main`.
export function realtimeAlert(page: Page): Locator {
    return page.getByRole("status").and(page.locator("xpath=//*[not(ancestor::main)]"));
}

// Une marque posée dans la page. Un rechargement, comme toute navigation complète, l'efface ;
// le rafraîchissement des composants serveur que déclenche un avis la garde. La retrouver
// prouve que la page a changé SANS être rechargée.
export async function markPage(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as Window & { realtimeProbe?: true }).realtimeProbe = true;
    });
}

export async function expectNotReloaded(page: Page): Promise<void> {
    const marked = await page.evaluate(
        () => (window as Window & { realtimeProbe?: true }).realtimeProbe === true,
    );
    expect(marked, "la page a été rechargée").toBe(true);
}

// Guette l'acceptation de la connexion temps réel d'une page : le paquet de connexion de
// Socket.IO, « 40 », que la passerelle renvoie. À appeler AVANT la navigation, faute de quoi
// la connexion et ce paquet, qui ne se répètent pas, seraient déjà passés. La fonction rendue
// attend l'acceptation.
//
// La passerelle rejoint les salles juste APRÈS ce paquet, le temps de lire la session : un
// avis émis dans cet intervalle serait perdu. Une écriture déclenchée ensuite par le parcours
// traverse le navigateur, l'API et la base avant d'émettre, ce qui laisse à la jonction le
// temps de se faire, sans que rien ne le garantisse.
export function watchRealtimeConnection(page: Page): () => Promise<void> {
    let accepted = false;
    page.on("websocket", (socket) => {
        if (!socket.url().includes("/socket.io/")) {
            return;
        }
        socket.on("framereceived", ({ payload }) => {
            if (typeof payload === "string" && payload.startsWith("40")) {
                accepted = true;
            }
        });
    });
    return () =>
        expect
            .poll(() => accepted, {
                ...AFTER_EVENT,
                message: "la passerelle n'a pas accepté la connexion temps réel",
            })
            .toBe(true);
}
