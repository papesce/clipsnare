import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { findProvider } from "./providers/index.mjs";

const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = join(process.cwd(), "public");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    if (requestUrl.pathname === "/api/extract") {
      await handleExtract(requestUrl, res);
      return;
    }

    await serveStatic(requestUrl.pathname, res);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`ClipSnare running at http://${HOST}:${PORT}`);
  });
}

async function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, cleanPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypes.get(extname(filePath)) || "application/octet-stream"
    });
    res.end(body);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleExtract(requestUrl, res) {
  const rawUrl = requestUrl.searchParams.get("url") || "";
  const method = requestUrl.searchParams.get("method") || "fetch";
  const targetUrl = parseHttpUrl(rawUrl);

  if (!targetUrl) {
    sendJson(res, 400, { error: "Enter a valid http or https URL." });
    return;
  }

  if (isMp4Url(targetUrl.href)) {
    const directLink = buildVideoLink(targetUrl.href);
    const provider = findProvider(targetUrl);
    const links = provider?.afterExtract
      ? await provider.afterExtract([directLink], targetUrl.href)
      : [directLink];

    sendJson(res, 200, {
      sourceUrl: targetUrl.href,
      method,
      count: links.length,
      links,
      warnings: []
    });
    return;
  }

  const result = method === "browser"
    ? await extractWithBrowser(targetUrl)
    : await extractWithFetch(targetUrl);

  const provider = findProvider(targetUrl);
  const links = provider?.afterExtract
    ? await provider.afterExtract(result.links, targetUrl.href)
    : result.links;

  sendJson(res, 200, {
    sourceUrl: targetUrl.href,
    method,
    count: links.length,
    links,
    warnings: links.length ? [] : result.errors.slice(0, 4)
  });
}

async function extractWithFetch(targetUrl) {
  const candidates = buildCandidateUrls(targetUrl);
  const collected = new Map();
  const errors = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        headers: getRequestHeaders(candidate, targetUrl.href)
      });

      if (!response.ok) {
        errors.push(`${candidate}: ${response.status} ${response.statusText}`);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();
      const links = extractMp4Links(body, response.url, contentType);

      for (const link of links) {
        collected.set(link.url, link);
      }
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }

  return {
    links: [...collected.values()],
    errors
  };
}

async function extractWithBrowser(targetUrl) {
  let chromium;

  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return {
      links: [],
      errors: ["Playwright is not installed. Run npm install, then install the Chromium browser with npx playwright install chromium."]
    };
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  const collected = new Map();
  const errors = [];

  try {
    const page = await browser.newPage({
      viewport: { width: 1365, height: 900 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    });

    page.on("request", (request) => {
      addLinks(collected, extractMp4Links(request.url(), targetUrl.href, "text/plain"));
    });

    page.on("response", (response) => {
      addLinks(collected, extractMp4Links(response.url(), targetUrl.href, "text/plain"));
    });

    await page.goto(targetUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await waitForSettledPage(page);

    const content = await page.content();
    addLinks(collected, extractMp4Links(content, page.url(), "text/html"));

    const domValues = await page.evaluate(() => {
      const values = [];
      for (const element of document.querySelectorAll("video, source, a")) {
        values.push(element.getAttribute("src") || "");
        values.push(element.getAttribute("href") || "");
      }
      return values.filter(Boolean);
    });
    addLinks(collected, extractMp4Links(domValues.join("\n"), page.url(), "text/plain"));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Playwright scan failed");
  } finally {
    await browser.close();
  }

  return {
    links: [...collected.values()],
    errors
  };
}

async function waitForSettledPage(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    await page.waitForTimeout(3500);
  }
}

function addLinks(collected, links) {
  for (const link of links) {
    collected.set(link.url, link);
  }
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isMp4Url(value) {
  try {
    const url = new URL(value);
    return url.pathname.toLowerCase().endsWith(".mp4");
  } catch {
    return false;
  }
}

function buildVideoLink(value) {
  const url = new URL(value);
  return {
    url: url.href,
    host: url.hostname,
    filename: filenameFromUrl(url.href)
  };
}

function buildCandidateUrls(targetUrl) {
  const urls = [targetUrl.href];
  const provider = findProvider(targetUrl);

  if (provider?.transformUrl) {
    const transformed = provider.transformUrl(targetUrl);
    if (transformed) {
      urls.unshift(transformed);
    }
  }

  return [...new Set(urls)];
}

export function extractMp4Links(body, baseUrl, contentType) {
  const sources = [];

  if (contentType.includes("json")) {
    try {
      collectStrings(JSON.parse(body), sources);
    } catch {
      sources.push(body);
    }
  } else {
    sources.push(body);
  }

  const text = decodeEntities(sources.join("\n"));
  const directLinks = findDirectMp4Links(text, baseUrl);
  const metadataLinks = findMetadataMp4Links(text, baseUrl);
  const patternLinks = findPatternLinks(text, baseUrl);
  const links = [...directLinks, ...metadataLinks, ...patternLinks];
  const unique = new Map();

  for (const url of links) {
    unique.set(url, buildVideoLink(url));
  }

  return [...unique.values()];
}

function collectStrings(value, output) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
}

function findDirectMp4Links(text, baseUrl) {
  const matches = text.matchAll(/(?:https?:)?\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi);
  return [...matches]
    .map((match) => absolutize(match[0].replace(/^\/\//, "https://"), baseUrl))
    .filter(Boolean);
}

function findMetadataMp4Links(text, baseUrl) {
  const collected = new Set();
  const htmlAttributeMatches = text.matchAll(/<(?:video|source|meta|link)\b[^>]*\b(?:src|href|content)\s*=\s*(?:"([^"]+?\.mp4(?:\?[^"]*)?)"|'([^']+?\.mp4(?:\?[^']*)?)'|([^\s"'<>`]+?\.mp4(?:\?[^\s"'<>`]*)?))[^>]*>/gi);
  const jsonLdMatches = text.matchAll(/"(?:contentUrl|embedUrl|url)"\s*:\s*"([^"]+?\.mp4(?:\?[^"]*)?)"/gi);

  for (const match of htmlAttributeMatches) {
    addMp4Reference(collected, match[1] || match[2] || match[3], baseUrl);
  }

  for (const match of jsonLdMatches) {
    addMp4Reference(collected, match[1], baseUrl);
  }

  return [...collected];
}

function addMp4Reference(collected, value, baseUrl) {
  const cleaned = value.trim().replace(/^\/\//, "https://");
  const absoluteUrl = absolutize(cleaned, baseUrl);
  if (absoluteUrl && isMp4Url(absoluteUrl)) {
    collected.add(absoluteUrl);
  }
}

function findPatternLinks(text, baseUrl) {
  const collected = new Set();
  const provider = findProvider(new URL(baseUrl));

  for (const pattern of provider?.extractPatterns || []) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      collected.add(pattern.template(match));
    }
  }

  return [...collected];
}

function absolutize(value, baseUrl) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function filenameFromUrl(value) {
  const url = new URL(value);
  const segment = url.pathname.split("/").filter(Boolean).at(-1);
  return segment || "video.mp4";
}

function decodeEntities(value) {
  return value
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003D", "=")
    .replaceAll("\\u003F", "?");
}

function getRequestHeaders(targetUrl, refererUrl) {
  const url = new URL(targetUrl);
  const headers = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.8",
    "referer": refererUrl,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };

  const provider = findProvider(url);
  if (provider?.getHeaders) {
    Object.assign(headers, provider.getHeaders(url, refererUrl));
  }

  return headers;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}
