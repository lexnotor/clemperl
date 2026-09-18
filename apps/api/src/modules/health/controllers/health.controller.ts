import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
    @Get()
    lire(): { statut: string; application: string } {
        return { statut: "ok", application: "api" };
    }
}
