import {
    applyProviderEvent,
    prisma,
    readOrderToPay,
    readVendorForMember,
    recordAttempt,
    settleOffline,
} from "@clemperl/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { adapterFor, offlineMethods, type TPaymentRegistry } from "../adapters";
import {
    ERROR_NO_ADAPTER,
    ERROR_NOT_A_MEMBER,
    ERROR_PROVIDER_UNKNOWN,
    PAYMENTS_ENV,
    PAYMENT_REGISTRY,
} from "../constants";
import type { IPaymentsEnv } from "../interfaces";
import { encryptPayload } from "../utils";

@Injectable()
export class PaymentsService {
    constructor(
        @Inject(PAYMENT_REGISTRY) private readonly registry: TPaymentRegistry,
        @Inject(PAYMENTS_ENV) private readonly env: IPaymentsEnv,
    ) {}

    async start(input: { buyerId: string; orderId: string; locale: string }): Promise<string> {
        const order = await readOrderToPay(prisma, {
            buyerId: input.buyerId,
            orderId: input.orderId,
        });

        const adapter = adapterFor(this.registry, order.method);
        if (adapter === null) {
            throw new Error(ERROR_NO_ADAPTER);
        }

        const started = await adapter.start({
            orderId: order.id,
            reference: order.reference,
            amount: order.amount,
            currency: order.currency,
            returnUrl: `${this.env.storefrontUrl}/${input.locale}/orders/${order.reference}`,
        });

        // La tentative est écrite AVANT de rendre l'URL. Dans l'autre ordre, un webhook
        // rapide arriverait sur une référence que la base ne connaît pas encore, et serait
        // refusé alors que le paiement a bien eu lieu.
        //
        // La fenêtre n'est pas close pour autant, et elle ne peut pas l'être ici : chez un
        // vrai fournisseur, `start` a déjà créé le paiement chez lui, donc un webhook émis
        // entre ce retour et la validation de cette écriture tombe sur une référence
        // inconnue et reçoit un 404. Ce qui le rattrape est le RÉESSAI du fournisseur, pas
        // ce code.
        await recordAttempt(prisma, {
            orderId: order.id,
            method: order.method,
            amount: order.amount,
            currency: order.currency,
            provider: adapter.provider,
            providerRef: started.providerRef,
        });

        return started.redirectUrl;
    }

    async settle(input: { userId: string; orderId: string }): Promise<void> {
        const vendor = await readVendorForMember(prisma, input.userId);
        if (!vendor) {
            throw new Error(ERROR_NOT_A_MEMBER);
        }
        await settleOffline(prisma, {
            vendorId: vendor.id,
            orderId: input.orderId,
            userId: input.userId,
            offlineMethods: offlineMethods(this.registry),
        });
    }

    // Rend `false` quand la signature est fausse ou le corps illisible, pour que le
    // contrôleur réponde 400 sans rien écrire. Un rejeu rend `true` : le dépôt dit qu'il
    // n'a rien changé, et le fournisseur doit recevoir 200 pour cesser de rejouer.
    async receive(input: {
        provider: string;
        raw: string;
        headers: Readonly<Record<string, string>>;
    }): Promise<boolean> {
        const adapter = [...this.registry.values()].find((a) => a.provider === input.provider);
        if (!adapter) {
            throw new NotFoundException(ERROR_PROVIDER_UNKNOWN);
        }

        const event = adapter.interpret(input.raw, input.headers);
        if (event === null) {
            return false;
        }

        // Le payload est chiffré TEL QU'IL A ÉTÉ REÇU, caractère pour caractère : ce qu'on
        // garde est la preuve du fournisseur, pas notre lecture de celle-ci.
        await applyProviderEvent(prisma, {
            provider: adapter.provider,
            providerRef: event.providerRef,
            status: event.status,
            rawPayload: encryptPayload(this.env.payloadKey, input.raw),
        });
        return true;
    }
}
