import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Fusionne des classes Tailwind en résolvant les conflits : `twMerge` garde la
// dernière classe d'une même famille, ce que la simple concaténation ne fait pas.
// Sans cela, une classe passée en prop ne peut pas surcharger celle du composant.
export function cn(...entrees: ClassValue[]): string {
    return twMerge(clsx(entrees));
}
