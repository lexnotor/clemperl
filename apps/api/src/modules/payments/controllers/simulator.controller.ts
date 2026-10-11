import { E_CURRENCY, formatMoney, type TCurrency } from "@clemperl/core";
import {
    BadGatewayException,
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    Inject,
    NotFoundException,
    Param,
    Post,
    Query,
    Redirect,
} from "@nestjs/common";
import { API_PORT } from "../../../constants";
import { SIGNATURE_HEADER, SIMULATED_PROVIDER, signSimulatedPayload } from "../adapters";
import {
    ERROR_RETURN_URL_REFUSED,
    ERROR_SIMULATOR_DISABLED,
    ERROR_SIMULATOR_INPUT_INVALID,
    ERROR_WEBHOOK_REFUSED,
    PAYMENTS_ENV,
} from "../constants";
import type { IPaymentsEnv } from "../interfaces";
import { escapeHtml } from "../utils";

// L'API s'appelle par son port INTERNE et par 127.0.0.1 : en conteneur, l'adresse publique
// n'existe pas de l'intérieur, et `localhost` y résout vers ::1 alors que le serveur écoute
// en IPv4 seulement. Le port est celui sur lequel `main.ts` écoute : une seule constante.
const WEBHOOK_URL = `http://127.0.0.1:${API_PORT}/payments/webhook/${SIMULATED_PROVIDER}`;

const OUTCOMES = ["SETTLED", "FAILED"] as const;

function readString(source: Record<string, unknown> | undefined, name: string): string {
    const value = source?.[name];
    return typeof value === "string" ? value : "";
}

function isCurrency(value: string): value is TCurrency {
    return (Object.values(E_CURRENCY) as string[]).includes(value);
}

// Les libellés sont FIXES : cette page n'existe qu'en développement, et aucun catalogue de
// traduction ne la sert.
function outcomeForm(action: string, returnUrl: string, outcome: string, label: string): string {
    return `<form method="post" action="${escapeHtml(action)}">
<input type="hidden" name="returnUrl" value="${escapeHtml(returnUrl)}">
<input type="hidden" name="outcome" value="${outcome}">
<button type="submit">${label}</button>
</form>`;
}

// Le fournisseur de développement : une page à deux boutons qui joue le rôle de la banque.
// Les deux routes répondent 404 quand le simulateur est éteint : répondre ainsi, plutôt que
// de ne pas monter la route, garde le module statique.
@Controller("payments/simulator")
export class SimulatorController {
    constructor(@Inject(PAYMENTS_ENV) private readonly env: IPaymentsEnv) {}

    @Get(":ref")
    @Header("content-type", "text/html; charset=utf-8")
    page(
        @Param("ref") ref: string,
        @Query() query: Record<string, unknown> | undefined,
    ): string {
        this.assertEnabled();

        const amount = readString(query, "amount");
        const currency = readString(query, "currency");
        if (!/^\d+$/u.test(amount) || !isCurrency(currency)) {
            throw new BadRequestException(ERROR_SIMULATOR_INPUT_INVALID);
        }

        const action = `/payments/simulator/${encodeURIComponent(ref)}`;
        const returnUrl = readString(query, "returnUrl");
        const formatted = formatMoney({ amount: Number(amount), currency }, "fr");

        return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paiement simulé</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; }
main { max-width: 24rem; margin: 3rem auto; padding: 1rem; text-align: center; }
button { font: inherit; padding: 0.5rem 1.5rem; margin: 0.25rem; }
</style>
</head>
<body>
<main>
<h1>Paiement simulé</h1>
<p>Commande <strong>${escapeHtml(readString(query, "reference"))}</strong></p>
<p><strong>${escapeHtml(formatted)}</strong></p>
${outcomeForm(action, returnUrl, "SETTLED", "Payer")}
${outcomeForm(action, returnUrl, "FAILED", "Échouer")}
</main>
</body>
</html>`;
    }

    // 303 et non 302 : la redirection suit un POST, et 303 est ce qui dit au navigateur de la
    // suivre en GET.
    @Post(":ref")
    @Redirect()
    async decide(
        @Param("ref") ref: string,
        @Body() body: Record<string, unknown> | undefined,
    ): Promise<{ url: string; statusCode: number }> {
        this.assertEnabled();

        // Le retour est vérifié AVANT tout le reste : sans cela, la page est une redirection
        // ouverte, et une URL fabriquée enverrait l'acheteur ailleurs depuis un domaine qu'il
        // croit être le nôtre. La vérification porte sur l'adresse de la vitrine SUIVIE d'une
        // barre : un simple préfixe laisserait passer `https://vitrine.test.ailleurs.com`.
        const returnUrl = readString(body, "returnUrl");
        if (!returnUrl.startsWith(`${this.env.storefrontUrl}/`)) {
            throw new BadRequestException(ERROR_RETURN_URL_REFUSED);
        }

        const outcome = readString(body, "outcome");
        if (!(OUTCOMES as readonly string[]).includes(outcome)) {
            throw new BadRequestException(ERROR_SIMULATOR_INPUT_INVALID);
        }

        // Le simulateur appelle son PROPRE webhook plutôt que de marquer le paiement : le
        // détour exerce la signature, la normalisation et l'idempotence, c'est-à-dire ce
        // qu'un vrai fournisseur mettra à l'épreuve.
        const raw = JSON.stringify({ providerRef: ref, status: outcome });
        const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                [SIGNATURE_HEADER]: signSimulatedPayload(this.env.simulatorSecret, raw),
            },
            body: raw,
        });
        // Rediriger malgré un webhook refusé ramènerait l'acheteur sur une commande restée
        // en attente, sans rien dire de pourquoi.
        if (!response.ok) {
            throw new BadGatewayException(ERROR_WEBHOOK_REFUSED);
        }

        return { url: returnUrl, statusCode: 303 };
    }

    private assertEnabled(): void {
        if (!this.env.simulator) {
            throw new NotFoundException(ERROR_SIMULATOR_DISABLED);
        }
    }
}
