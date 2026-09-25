// Les trois largeurs servies : une vignette de liste, une carte, un plein écran. Écrites
// ICI et nulle part ailleurs — le worker les produit, la route les autorise, et T2d les
// demandera. Trois copies divergeraient au premier ajustement, et la route servirait
// alors des largeurs que personne ne produit.
export const DERIVATIVE_WIDTHS = [320, 800, 1600] as const;

export type TDerivativeWidth = (typeof DERIVATIVE_WIDTHS)[number];
