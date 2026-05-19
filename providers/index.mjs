import reddit from "./reddit.mjs";

export const providers = [reddit];

export function findProvider(url) {
  return providers.find((p) => p.test(url));
}
