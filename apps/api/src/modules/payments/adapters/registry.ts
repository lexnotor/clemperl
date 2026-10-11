import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import type { IPaymentAdapter } from "../interfaces";
import { SimulatedAdapter } from "./simulated.adapter";

export type TPaymentRegistry = ReadonlyMap<string, IPaymentAdapter>;

export interface IRegistryOptions {
    simulator: boolean;
    secret: string;
    publicUrl: string;
}

// Les méthodes que le simulateur sert. Les autres se règlent hors ligne quoi qu'il
// arrive : un virement n'a pas de redirection à offrir.
const SIMULATED_METHODS = [E_PAYMENT_METHOD.CARD, E_PAYMENT_METHOD.MOBILE_MONEY];

export function buildRegistry(options: IRegistryOptions): TPaymentRegistry {
    const registry = new Map<string, IPaymentAdapter>();
    if (options.simulator) {
        const adapter = new SimulatedAdapter(options.secret, options.publicUrl);
        for (const method of SIMULATED_METHODS) {
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
