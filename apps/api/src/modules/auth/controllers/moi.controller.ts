import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../guards";

@Controller("moi")
@UseGuards(SessionGuard)
export class MoiController {
    @Get()
    lire(@Req() requete: { session: { user: { id: string; email: string } } }): {
        id: string;
        email: string;
    } {
        return { id: requete.session.user.id, email: requete.session.user.email };
    }
}
