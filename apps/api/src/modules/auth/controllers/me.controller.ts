import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../guards";

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
    @Get()
    read(@Req() request: { session: { user: { id: string; email: string } } }): {
        id: string;
        email: string;
    } {
        return { id: request.session.user.id, email: request.session.user.email };
    }
}
