import {
    ERROR_PAYMENT_ALREADY_SETTLED,
    ERROR_PAYMENT_NOT_OFFLINE,
    ERROR_PAYMENT_ORDER_CANCELLED,
    ERROR_PAYMENT_ORDER_NOT_FOUND,
} from "@clemperl/db";
import {
    Body,
    ConflictException,
    Controller,
    NotFoundException,
    Param,
    Post,
    Req,
    UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "../../auth/guards";
import { ERROR_NO_ADAPTER, ERROR_NOT_A_MEMBER } from "../constants";
import { OriginGuard } from "../guards";
import { PaymentsService } from "../services";

// Ce que le dépôt refuse parce que la ressource n'existe pas POUR cet appelant : pour un
// non-membre comme pour une commande d'un autre, la réponse est la même, 404.
const NOT_FOUND_CODES: readonly string[] = [ERROR_PAYMENT_ORDER_NOT_FOUND, ERROR_NOT_A_MEMBER];

// Ce que le dépôt refuse parce que l'état de la commande ne le permet pas. Le code part dans
// le corps : l'écran choisit son message d'après lui.
const CONFLICT_CODES: readonly string[] = [
    ERROR_PAYMENT_ORDER_CANCELLED,
    ERROR_PAYMENT_ALREADY_SETTLED,
    ERROR_PAYMENT_NOT_OFFLINE,
    ERROR_NO_ADAPTER,
];

// Toute autre erreur est relancée telle quelle : une panne ne doit pas sortir en 409, et
// l'écran la prendrait pour un état de la commande.
function toHttp(error: unknown): unknown {
    if (error instanceof Error) {
        if (NOT_FOUND_CODES.includes(error.message)) {
            return new NotFoundException(error.message);
        }
        if (CONFLICT_CODES.includes(error.message)) {
            return new ConflictException(error.message);
        }
    }
    return error;
}

// L'origine se vérifie AVANT la session : le refus est moins cher qu'une lecture de session,
// et une requête qui ne vient pas d'un de nos fronts n'a aucune raison d'en coûter une.
@Controller("payments")
@UseGuards(OriginGuard, SessionGuard)
export class PaymentsController {
    constructor(private readonly service: PaymentsService) {}

    @Post("start")
    async start(
        @Req() request: { session: { user: { id: string } } },
        // Express 5 laisse `body` indéfini quand la requête n'en porte pas.
        @Body() body: { orderId?: unknown; locale?: unknown } | undefined,
    ): Promise<{ redirectUrl: string }> {
        const orderId = typeof body?.orderId === "string" ? body.orderId : "";
        const locale = body?.locale === "en" ? "en" : "fr";
        try {
            const redirectUrl = await this.service.start({
                buyerId: request.session.user.id,
                orderId,
                locale,
            });
            return { redirectUrl };
        } catch (error) {
            throw toHttp(error);
        }
    }

    @Post(":orderId/settle")
    async settle(
        @Req() request: { session: { user: { id: string } } },
        @Param("orderId") orderId: string,
    ): Promise<{ settled: true }> {
        try {
            await this.service.settle({ userId: request.session.user.id, orderId });
            return { settled: true };
        } catch (error) {
            throw toHttp(error);
        }
    }
}
