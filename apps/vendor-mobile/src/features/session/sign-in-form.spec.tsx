import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { SignInForm, type TSignIn } from "./sign-in-form";

// Les libellés attendus sont ceux du catalogue français : la langue du téléphone est fixée.
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "fr" }] }));

async function fillAndSubmit(signIn: TSignIn, onSignedIn = jest.fn()) {
    const user = userEvent.setup();
    await render(<SignInForm signIn={signIn} onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText("Adresse électronique"), "awa@atelier.test");
    await user.type(screen.getByLabelText("Mot de passe"), "motdepasse123");
    await user.press(screen.getByRole("button", { name: "Se connecter" }));
    return { onSignedIn };
}

describe("SignInForm", () => {
    it("envoie le courriel et le mot de passe, puis signale la connexion", async () => {
        const signIn = jest.fn<ReturnType<TSignIn>, Parameters<TSignIn>>(async () => ({ error: null }));

        const { onSignedIn } = await fillAndSubmit(signIn);

        expect(signIn).toHaveBeenCalledWith({
            email: "awa@atelier.test",
            password: "motdepasse123",
        });
        await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    });

    it("dit un mot de passe faux sans planter, et garde la saisie", async () => {
        const signIn: TSignIn = async () => ({
            error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
        });

        const { onSignedIn } = await fillAndSubmit(signIn);

        expect(await screen.findByText("Adresse ou mot de passe incorrect.")).toBeTruthy();
        expect(screen.getByLabelText("Adresse électronique").props.value).toBe("awa@atelier.test");
        expect(onSignedIn).not.toHaveBeenCalled();
    });

    // Better Auth refuse la connexion d'un compte dont l'adresse n'est pas vérifiée : le
    // vendeur doit lire quoi faire, pas « échec ».
    it("dit un courriel jamais vérifié", async () => {
        const signIn: TSignIn = async () => ({ error: { status: 403, code: "EMAIL_NOT_VERIFIED" } });

        await fillAndSubmit(signIn);

        expect(
            await screen.findByText(
                "Votre adresse n'est pas encore vérifiée. Ouvrez le lien reçu par courriel, puis réessayez.",
            ),
        ).toBeTruthy();
    });

    // Une adresse mal formée est une faute de saisie : la relire, pas réessayer plus tard.
    it("dit une adresse mal formée comme des identifiants refusés", async () => {
        const signIn: TSignIn = async () => ({ error: { status: 400, code: "INVALID_EMAIL" } });

        await fillAndSubmit(signIn);

        expect(await screen.findByText("Adresse ou mot de passe incorrect.")).toBeTruthy();
    });

    // Un 403 n'est pas toujours un courriel non vérifié : une origine refusée est un réglage
    // du serveur, et renvoyer le vendeur vers sa boîte de réception l'égarerait.
    it("ne prend pas une origine refusée pour un courriel non vérifié", async () => {
        const signIn: TSignIn = async () => ({ error: { status: 403, code: "INVALID_ORIGIN" } });

        await fillAndSubmit(signIn);

        expect(
            await screen.findByText("La connexion a échoué. Réessayez dans un instant."),
        ).toBeTruthy();
    });

    it("dit une panne sans planter", async () => {
        const signIn: TSignIn = async () => {
            throw new TypeError("Network request failed");
        };

        await fillAndSubmit(signIn);

        expect(
            await screen.findByText("La connexion a échoué. Réessayez dans un instant."),
        ).toBeTruthy();
    });

    // Deux pressions rapides enverraient deux connexions.
    it("désactive le bouton pendant l'envoi", async () => {
        let release: () => void = () => undefined;
        const signIn: TSignIn = () =>
            new Promise((resolve) => {
                release = () => resolve({ error: null });
            });

        await fillAndSubmit(signIn);

        expect(screen.getByRole("button", { name: "Connexion…" })).toBeDisabled();
        release();
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled(),
        );
    });
});
