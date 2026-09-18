import { NextResponse } from "next/server";

// Sonde de santé utilisée par le healthcheck du compose. `force-dynamic` empêche Next
// de la pré-rendre au build : une sonde figée renverrait « en bonne santé » même
// processus éteint.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
    return NextResponse.json({ statut: "ok", application: "vendor" });
}
