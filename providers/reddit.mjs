import { extractMp4Links } from "../server.mjs";

const REDDIT_HOST_REGEX = /(^|\.)reddit\.com$/i;

export default {
  name: "reddit",

  test(url) {
    const hostname = url.hostname.toLowerCase();
    return REDDIT_HOST_REGEX.test(hostname) || hostname === "v.redd.it";
  },

  transformUrl(url) {
    if (!REDDIT_HOST_REGEX.test(url.hostname)) {
      return null;
    }
    const next = new URL(url.href);
    next.searchParams.set("raw_json", "1");
    next.searchParams.set("include_over_18", "1");
    if (!next.pathname.endsWith(".json")) {
      next.pathname = next.pathname.replace(/\/?$/, ".json");
    }
    return next.href;
  },

  getHeaders(url, refererUrl) {
    if (url.hostname.toLowerCase().endsWith("reddit.com") || url.hostname.toLowerCase().endsWith("v.redd.it")) {
      return { "cookie": "over18=1" };
    }
    return {};
  },

  async afterExtract(links, refererUrl) {
    const collected = new Map();

    for (const link of links) {
      const manifestUrl = redditManifestUrlFromVideoUrl(link.url);

      if (!manifestUrl) {
        collected.set(link.url, link);
        continue;
      }

      const manifestLinks = await fetchRedditManifestLinks(manifestUrl, refererUrl);

      if (manifestLinks.length) {
        for (const manifestLink of manifestLinks) {
          collected.set(manifestLink.url, manifestLink);
        }
        continue;
      }

      collected.set(link.url, link);
    }

    return [...collected.values()];
  },

  extractPatterns: [
    {
      regex: /https?:\/\/v\.redd\.it\/([a-z0-9]+)(?:\/[^\s"'<>\\]*)?/gi,
      template: (match) => `https://v.redd.it/${match[1]}/CMAF_720.mp4`
    }
  ]
};

async function fetchRedditManifestLinks(manifestUrl, refererUrl) {
  try {
    // We need a way to get the generic headers or just re-implement a minimal fetch here.
    // For simplicity, let's use the native fetch.
    const response = await fetch(manifestUrl, {
      redirect: "follow",
      headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.8",
        "referer": refererUrl,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "cookie": "over18=1"
      }
    });

    if (!response.ok) {
      return [];
    }

    return extractRedditManifestLinks(
      await response.text(),
      response.url,
      response.headers.get("content-type") || ""
    );
  } catch {
    return [];
  }
}

function extractRedditManifestLinks(body, baseUrl, contentType) {
  const links = extractMp4Links(body, baseUrl, contentType)
    .filter((link) => isRedditRenditionLink(link.url));
  const byResolution = new Map();

  for (const link of links) {
    const resolution = redditRenditionScore(link.url);
    const existing = byResolution.get(resolution);

    if (!existing || (isCmafRendition(link.url) && !isCmafRendition(existing.url))) {
      byResolution.set(resolution, link);
    }
  }

  return [...byResolution.values()].sort((a, b) => redditRenditionScore(b.url) - redditRenditionScore(a.url));
}

function redditManifestUrlFromVideoUrl(value) {
  try {
    const url = new URL(value);

    if (url.hostname.toLowerCase() !== "v.redd.it") {
      return null;
    }

    const match = url.pathname.match(/^\/([a-z0-9]+)(?:\/(?:DASH|CMAF)_[^/]+\.mp4|\/DASHPlaylist\.mpd)?\/?$/i);

    if (!match) {
      return null;
    }

    return `https://v.redd.it/${match[1]}/DASHPlaylist.mpd`;
  } catch {
    return null;
  }
}

function isRedditRenditionLink(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === "v.redd.it" && /\/(?:DASH|CMAF)_(\d+)\.mp4$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function redditRenditionScore(value) {
  const match = value.match(/\/(?:DASH|CMAF)_(\d+)\.mp4$/i);
  return match ? Number(match[1]) : -1;
}

function isCmafRendition(value) {
  return /\/CMAF_(\d+)\.mp4$/i.test(value);
}
