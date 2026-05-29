import { config } from "../config.mjs";

const BRAND_LABEL = config.brand.label;
const BRAND_DOMAIN = config.brand.domain;
const BRAND_MEDIA_DOMAIN = config.brand.mediaDomain;
const BRAND_HOST_REGEX = new RegExp(`(^|\\.)${BRAND_DOMAIN.replace(".", "\\.")}$`, "i");

export default {
  name: "brand",

  test(url) {
    return BRAND_HOST_REGEX.test(url.hostname);
  },

  getHeaders(url, refererUrl) {
    if (BRAND_HOST_REGEX.test(url.hostname)) {
      return {
        "referer": `https://www.${BRAND_DOMAIN}/`,
        "origin": `https://www.${BRAND_DOMAIN}`
      };
    }
    return {};
  },

  extractPatterns: [
    {
      // Match ID from watch or iframe URLs
      regex: new RegExp(`${BRAND_DOMAIN.replace(".", "\\.")}\\/(?:watch|ifr)\\/([a-z0-9]+)`, "gi"),
      template: (match) => `https://${BRAND_MEDIA_DOMAIN}/${match[1]}.mp4`
    },
    {
      // Match direct media URLs
      regex: new RegExp(`${BRAND_MEDIA_DOMAIN.replace(".", "\\.")}\\/([a-z0-9-]+)\\.mp4`, "gi"),
      template: (match) => `https://${BRAND_MEDIA_DOMAIN}/${match[1]}.mp4`
    }
  ],

  async afterExtract(links, refererUrl) {
    const unique = new Map();
    const casedIds = new Map();

    // If the referer is a supported page, try to fetch it to find correctly cased IDs
    if (refererUrl && BRAND_HOST_REGEX.test(new URL(refererUrl).hostname)) {
      try {
        const response = await fetch(refererUrl, {
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "referer": `https://www.${BRAND_DOMAIN}/`
          }
        });
        if (response.ok) {
          const body = await response.text();
          const matches = body.matchAll(new RegExp(`${BRAND_MEDIA_DOMAIN.replace(".", "\\.")}\\/([a-zA-Z0-9-]+)\\.(?:mp4|jpg|webm)`, "gi"));
          for (const match of matches) {
            const id = match[1].replace("-mobile", "").replace("-hd", "");
            casedIds.set(id.toLowerCase(), id);
          }
        }
      } catch {
        // Ignore fetch errors
      }
    }

    for (const link of links) {
      if (!BRAND_HOST_REGEX.test(link.host) && link.host !== BRAND_MEDIA_DOMAIN) {
        unique.set(link.url, link);
        continue;
      }

      const idMatch = link.url.match(new RegExp(`${BRAND_MEDIA_DOMAIN.replace(".", "\\.")}\\/([a-z0-9-]+)\\.mp4`, "i"));
      if (idMatch) {
        let id = idMatch[1].replace("-mobile", "").replace("-hd", "");
        // Fix casing if we found it
        id = casedIds.get(id.toLowerCase()) || id;
        
        const hdUrl = `https://${BRAND_MEDIA_DOMAIN}/${id}.mp4`;
        const mobileUrl = `https://${BRAND_MEDIA_DOMAIN}/${id}-mobile.mp4`;
        
        unique.set(hdUrl, {
          url: hdUrl,
          host: BRAND_LABEL,
          filename: `${id}.mp4`
        });
        
        unique.set(mobileUrl, {
          url: mobileUrl,
          host: BRAND_LABEL,
          filename: `${id}-mobile.mp4`
        });
      }
    }

    return [...unique.values()];
  }
};
