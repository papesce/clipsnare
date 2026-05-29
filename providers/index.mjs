import reddit from "./reddit.mjs";
import brand from "./brand.mjs";

export const providers = [reddit, brand];

export function findProvider(url) {
  return providers.find((p) => p.test(url));
}
