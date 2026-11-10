import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrdersResolver } from "./resolvers";

// `AuthModule` exporte les gardes ET le jeton dont `SessionGuard` a besoin.
@Module({ imports: [AuthModule], providers: [OrdersResolver] })
export class OrdersModule {}
