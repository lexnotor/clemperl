import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
    IPaymentAdapter,
    IPaymentEvent,
    IPaymentStart,
    IPaymentStarted,
} from "../interfaces";

export const SIMULATED_PROVIDER = "SIMULATED";
export const SIGNATURE_HEADER = "x-clemperl-signature";

const STATUSES = ["PENDING", "SETTLED", "FAILED"] as const;

export function signSimulatedPayload(secret: string, raw: string): string {
    return createHmac("sha256", secret).update(raw).digest("hex");
}

// Comparaison à temps constant : comparer deux signatures avec `===` laisse mesurer où
// elles divergent, et donc les deviner octet par octet. La longueur se compare sur les
// tampons, en octets : `timingSafeEqual` lève sur deux longueurs différentes, et un en-tête
// public peut porter des caractères de plusieurs octets, donc 64 caractères pour plus de
// 64 octets.
function sameSignature(expected: string, received: string): boolean {
    const expectedBytes = Buffer.from(expected, "utf8");
    const receivedBytes = Buffer.from(received, "utf8");
    if (expectedBytes.length !== receivedBytes.length) {
        return false;
    }
    return timingSafeEqual(expectedBytes, receivedBytes);
}

// Le fournisseur de développement, à la manière de Mailpit pour les courriels. Il n'existe
// que pour exercer le parcours entier, redirection comprise, sans compte chez personne.
export class SimulatedAdapter implements IPaymentAdapter {
    readonly provider = SIMULATED_PROVIDER;

    constructor(
        private readonly secret: string,
        private readonly publicUrl: string,
    ) {}

    async start(input: IPaymentStart): Promise<IPaymentStarted> {
        const providerRef = `sim_${randomUUID()}`;
        const url = new URL(`${this.publicUrl}/payments/simulator/${providerRef}`);
        url.searchParams.set("amount", String(input.amount));
        url.searchParams.set("currency", input.currency);
        url.searchParams.set("reference", input.reference);
        url.searchParams.set("returnUrl", input.returnUrl);
        return { providerRef, redirectUrl: url.toString() };
    }

    interpret(raw: string, headers: Readonly<Record<string, string>>): IPaymentEvent | null {
        const received = headers[SIGNATURE_HEADER];
        if (typeof received !== "string") {
            return null;
        }
        if (!sameSignature(signSimulatedPayload(this.secret, raw), received)) {
            return null;
        }

        let body: unknown;
        try {
            body = JSON.parse(raw);
        } catch {
            return null;
        }
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            return null;
        }

        const { providerRef, status } = body as { providerRef?: unknown; status?: unknown };
        if (typeof providerRef !== "string" || providerRef === "") {
            return null;
        }
        if (typeof status !== "string" || !STATUSES.includes(status as never)) {
            return null;
        }
        return { providerRef, status: status as IPaymentEvent["status"] };
    }
}
