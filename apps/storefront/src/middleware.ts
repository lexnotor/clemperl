import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

// Le point de santé est exclu : il doit répondre sans négociation de langue, sinon une
// sonde reçoit une redirection au lieu d'un état.
export const config = {
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
