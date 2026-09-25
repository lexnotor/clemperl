export const PRODUCT_IMAGE_QUEUE = "product-images";

// sharp est du CALCUL, et il tourne dans le conteneur qui sert le HTTP. Sans borne, un
// lot de trente photos rend l'API muette pendant une minute. Deux est le compromis :
// assez pour ne pas traîner, assez peu pour laisser respirer les requêtes.
export const PRODUCT_IMAGE_CONCURRENCY = 2;
