import { useState, type JSX } from "react";
import { useT } from "../../i18n/use-t";
import type { TMessageKey } from "../../i18n/translate";
import { Button } from "../../ui/button";
import { Notice } from "../../ui/notice";
import { TextField } from "../../ui/text-field";

// La connexion, telle que le client Better Auth la rend : `error` vaut `null` quand elle réussit.
// Le formulaire reçoit la fonction au lieu d'importer le client : l'écran la branche, et les
// tests la remplacent.
export type TSignIn = (input: {
    email: string;
    password: string;
}) => Promise<{ error: { status: number; code?: string } | null }>;

interface SignInFormProps {
    signIn: TSignIn;
    onSignedIn: () => void;
}

// Le code d'un refus de Better Auth, traduit en ce que le vendeur doit lire. Le code et non le
// statut : un 403 dit aussi bien une adresse jamais vérifiée qu'une origine refusée, et un 400
// une adresse mal formée. Seules les fautes que le vendeur peut corriger ont leur phrase ; le
// reste, réglage du serveur compris, est un échec à réessayer.
function refusalKey(code: string | undefined): TMessageKey {
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_EMAIL") {
        return "signIn.invalidCredentials";
    }
    if (code === "EMAIL_NOT_VERIFIED") {
        return "signIn.emailNotVerified";
    }
    return "signIn.failed";
}

export function SignInForm({ signIn, onSignedIn }: SignInFormProps): JSX.Element {
    const t = useT();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [refusal, setRefusal] = useState<TMessageKey | null>(null);

    async function submit(): Promise<void> {
        setPending(true);
        setRefusal(null);
        try {
            const { error } = await signIn({ email: email.trim(), password });
            if (error === null) {
                onSignedIn();
                return;
            }
            setRefusal(refusalKey(error.code));
        } catch {
            // Une panne du réseau ou du serveur : la saisie reste, et le vendeur réessaie.
            setRefusal("signIn.failed");
        } finally {
            setPending(false);
        }
    }

    return (
        <>
            <TextField
                label={t("signIn.email")}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
            />
            <TextField
                label={t("signIn.password")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
            />
            {refusal !== null && <Notice text={t(refusal)} />}
            <Button
                label={pending ? t("signIn.submitting") : t("signIn.submit")}
                onPress={() => void submit()}
                disabled={pending}
            />
        </>
    );
}
