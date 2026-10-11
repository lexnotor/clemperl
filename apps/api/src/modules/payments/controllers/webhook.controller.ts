import { ERROR_PAYMENT_REF_UNKNOWN } from "@clemperl/db";
import {
    BadRequestException,
    Controller,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import { ERROR_SIGNATURE_REFUSED } from "../constants";
import { PaymentsService } from "../services";

// Les adapters cherchent leur signature par un nom EXACT, en minuscules, et lisent une
// chaîne. Node rend déjà les noms en minuscules, mais une valeur peut être absente ou, pour
// `set-cookie`, un tableau : seules les chaînes passent, sous un nom normalisé.
function stringHeaders(
    headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (typeof value === "string") {
            result[name.toLowerCase()] = value;
        }
    }
    return result;
}

@Controller("payments/webhook")
export class WebhookController {
    constructor(private readonly service: PaymentsService) {}

    // Aucune session, aucune vérification d'origine : ce point d'entrée ne vient pas d'un
    // navigateur, et sa preuve est sa signature. Rien ne s'écrit avant qu'elle soit vérifiée.
    @Post(":provider")
    @HttpCode(200)
    async receive(
        @Param("provider") provider: string,
        @Req()
        request: {
            rawBody?: Buffer;
            headers: Record<string, string | string[] | undefined>;
        },
    ): Promise<{ received: true }> {
        // Le corps BRUT, en chaîne : la signature porte sur les octets reçus, pas sur leur
        // relecture par un analyseur JSON qui réordonne et reformate. `rawBody` n'existe que
        // si l'application est créée avec `{ rawBody: true }` ; absent, la chaîne est vide,
        // aucune signature ne la valide, et la requête est refusée.
        const raw = request.rawBody?.toString("utf8") ?? "";

        let accepted: boolean;
        try {
            accepted = await this.service.receive({
                provider,
                raw,
                headers: stringHeaders(request.headers),
            });
        } catch (error) {
            if (error instanceof Error && error.message === ERROR_PAYMENT_REF_UNKNOWN) {
                throw new NotFoundException(ERROR_PAYMENT_REF_UNKNOWN);
            }
            throw error;
        }

        if (!accepted) {
            throw new BadRequestException(ERROR_SIGNATURE_REFUSED);
        }
        return { received: true };
    }
}
