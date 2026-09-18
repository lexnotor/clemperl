import { NextResponse } from "next/server";

// Sonde de santé utilisée par le healthcheck du compose et, plus tard, par
// l'orchestrateur de production. `force-dynamic` empêche Next de la pré-rendre au
// build : une sonde figée renverrait « en bonne santé » même processus éteint.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
    return NextResponse.json({ statut: "ok", application: "storefront" });
}
