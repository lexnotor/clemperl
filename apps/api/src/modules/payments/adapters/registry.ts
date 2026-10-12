import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import { PROVIDER_PAYMENT_METHODS } from "@clemperl/domain";
import type { IPaymentAdapter } from "../interfaces";
import { SimulatedAdapter } from "./simulated.adapter";

export type TPaymentRegistry = ReadonlyMap<string, IPaymentAdapter>;

export interface IRegistryOptions {
    simulator: boolean;
    secret: string;
    publicUrl: string;
}

export function buildRegistry(options: IRegistryOptions): TPaymentRegistry {
    const registry = new Map<string, IPaymentAdapter>();
    if (options.simulator) {
        const adapter = new SimulatedAdapter(options.secret, options.publicUrl);
        // L'adapter simulé sert toutes les méthodes à fournisseur. La liste vient du
        // domaine, d'où les écrans tirent la leur : recopier ici les deux valeurs ferait
        // du registre une seconde vérité, et c'est l'écart entre ces deux-là qui promet un
        // bouton « Payer » que l'API refuse ensuite.
        for (const method of PROVIDER_PAYMENT_METHODS) {
            registry.set(method, adapter);
        }
    }
    return registry;
}

// Une méthode EN LIGNE est une méthode qui a un adapter. Pas de booléen à côté, pas de
// liste à synchroniser, pas de manière d'être incohérent.
export function isOnline(registry: TPaymentRegistry, method: string): boolean {
    return registry.has(method);
}

export function adapterFor(registry: TPaymentRegistry, method: string): IPaymentAdapter | null {
    return registry.get(method) ?? null;
}

export function offlineMethods(registry: TPaymentRegistry): string[] {
    return Object.values(E_PAYMENT_METHOD).filter((method) => !registry.has(method));
}
