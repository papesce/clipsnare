const form = document.querySelector("#extract-form");
const app = document.querySelector(".app");
const bannerToggle = document.querySelector("#banner-toggle");
const input = document.querySelector("#url-input");
const toggleInputVisibility = document.querySelector("#toggle-input-visibility");
const submitButton = document.querySelector("#submit-button");
const copyAllButton = document.querySelector("#copy-all");
const bookmarkletLink = document.querySelector("#bookmarklet-link");
const qualityFilter = document.querySelector("#quality-filter");
const message = document.querySelector("#message");
const linksContainer = document.querySelector("#links");
const resultMeta = document.querySelector("#result-meta");
const template = document.querySelector("#link-template");

let currentLinks = [];
let activeVideo = null;
let lastResultText = "No URL scanned yet.";
const FRAME_STEP_SECONDS = 1 / 30;
const MIN_VIDEO_HEIGHT = 480;
updateBookmarkletLink();

bannerToggle.addEventListener("click", () => {
  const shouldMinimize = !app.classList.contains("banner-minimized");
  setBannerMinimized(shouldMinimize);
});

toggleInputVisibility.addEventListener("click", () => {
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";

  const eyeIcon = toggleInputVisibility.querySelector(".icon-eye");
  const eyeOffIcon = toggleInputVisibility.querySelector(".icon-eye-off");

  eyeIcon.hidden = !isPassword;
  eyeOffIcon.hidden = isPassword;
  toggleInputVisibility.setAttribute("aria-label", isPassword ? "Hide URL" : "Show URL");
});


form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const method = formData.get("method") || "fetch";
  updateAddress(input.value, method);
  await extractLinks(input.value, method);
});

form.addEventListener("change", (event) => {
  if (event.target.name === "method") {
    updateBookmarkletLink();
  }
});

copyAllButton.addEventListener("click", async () => {
  const visibleUrls = getVisibleItems()
    .map((item) => item.querySelector(".url")?.href)
    .filter(Boolean);
  await copyText(visibleUrls.join("\n"));
  copyAllButton.textContent = "Copied";
  window.setTimeout(() => {
    copyAllButton.textContent = "Copy All";
  }, 1400);
});

qualityFilter.addEventListener("change", applyFilters);

const initialParams = new URLSearchParams(window.location.search);
const initialUrl = initialParams.get("url");
const initialMethod = initialParams.get("method");

if (initialMethod === "fetch" || initialMethod === "browser") {
  const methodInput = form.elements.method;
  methodInput.value = initialMethod;
}

if (initialUrl) {
  input.value = initialUrl;
  extractLinks(initialUrl, getSelectedMethod());
}

async function extractLinks(url, method) {
  setBannerMinimized(true);
  setLoading(true);
  setMessage(method === "browser" ? "Running deep scan..." : "Running fast scan...", false);
  renderLinks([]);

  try {
    const params = new URLSearchParams({ url, method });
    const response = await fetch(`/api/extract?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not scan that URL.");
    }

    currentLinks = payload.links || [];
    const methodLabel = method === "browser" ? "deep scan" : "fast scan";
    lastResultText = currentLinks.length === 1
      ? `1 MP4 link found with ${methodLabel}.`
      : `${currentLinks.length} MP4 links found with ${methodLabel}.`;
    resultMeta.textContent = lastResultText;

    if (!currentLinks.length) {
      const warning = payload.warnings?.[0] ? ` ${payload.warnings[0]}` : "";
      const suggestion = method === "fetch" ? " Try Deep scan for pages that load video dynamically." : "";
      setMessage(`No direct MP4 links were found.${suggestion}${warning}`, true);
      return;
    }

    setMessage("", false);
    renderLinks(currentLinks);
  } catch (error) {
    currentLinks = [];
    resultMeta.textContent = "Scan failed.";
    setMessage(error instanceof Error ? error.message : "Could not scan that URL.", true);
  } finally {
    setLoading(false);
  }
}

function renderLinks(links) {
  linksContainer.replaceChildren();
  linksContainer.hidden = links.length === 0;
  copyAllButton.disabled = links.length === 0;
  lastResultText = links.length ? lastResultText : "No URL scanned yet.";

  for (const link of links) {
    const item = template.content.cloneNode(true);
    const article = item.querySelector(".link-item");
    const video = item.querySelector(".preview");
    const filename = item.querySelector(".filename");
    const host = item.querySelector(".host");
    const url = item.querySelector(".url");
    const urlWrapper = item.querySelector(".url-wrapper");
    const toggleUrl = item.querySelector(".toggle-url");
    const copy = item.querySelector(".copy-one");
    const open = item.querySelector(".open-one");
    const layoutToggle = item.querySelector(".toggle-layout");

    video.src = link.url;
    article.dataset.playable = "unknown";
    article.dataset.quality = "unknown";
    setupVideoControls(item, video);
    setupVideoQualityFilter(article, video);
    filename.textContent = link.filename || "video.mp4";
    host.textContent = link.host || new URL(link.url).hostname;
    url.href = link.url;
    url.textContent = link.url;

    toggleUrl.addEventListener("click", () => {
      const isHidden = urlWrapper.hidden;
      urlWrapper.hidden = !isHidden;
      toggleUrl.textContent = isHidden ? "Hide Link" : "Show Link";
    });

    copy.addEventListener("click", async () => {
      await copyText(link.url);
      copy.textContent = "Copied";
      window.setTimeout(() => {
        copy.textContent = "Copy";
      }, 1400);
    });
    open.href = link.url;
    setupLayoutToggle(article, layoutToggle);

    linksContainer.append(item);
  }

  applyFilters();
}

function setupLayoutToggle(article, button) {
  button.addEventListener("click", () => {
    const isCompact = article.classList.toggle("is-compact");
    const label = button.querySelector("span");
    const compactIcon = button.querySelector(".layout-compact-icon");
    const wideIcon = button.querySelector(".layout-wide-icon");

    button.setAttribute("aria-pressed", String(isCompact));
    button.setAttribute("aria-label", isCompact ? "Expand video width" : "Collapse video width");
    label.textContent = isCompact ? "Wide" : "Compact";
    compactIcon.hidden = isCompact;
    wideIcon.hidden = !isCompact;
  });
}

function setBannerMinimized(isMinimized) {
  app.classList.toggle("banner-minimized", isMinimized);
  bannerToggle.setAttribute("aria-expanded", String(!isMinimized));
  bannerToggle.setAttribute("aria-label", isMinimized ? "Expand banner" : "Collapse banner");
  const collapseIcon = bannerToggle.querySelector(".banner-collapse-icon");
  const expandIcon = bannerToggle.querySelector(".banner-expand-icon");
  if (isMinimized) {
    collapseIcon.setAttribute("hidden", "");
    expandIcon.removeAttribute("hidden");
  } else {
    expandIcon.setAttribute("hidden", "");
    collapseIcon.removeAttribute("hidden");
  }
}

function setupVideoQualityFilter(item, video) {
  video.addEventListener("loadedmetadata", () => {
    item.dataset.playable = "true";
    item.dataset.quality = video.videoHeight > 0 && video.videoHeight < MIN_VIDEO_HEIGHT ? "low" : "ok";
    applyFilters();
  });

  video.addEventListener("error", () => {
    item.dataset.playable = "false";
    item.dataset.quality = "unknown";
    applyFilters();
  });
}

function applyFilters() {
  const items = [...linksContainer.querySelectorAll(".link-item")];
  const hideBadVideos = qualityFilter.checked;
  let hiddenCount = 0;

  for (const item of items) {
    const shouldHide = hideBadVideos
      && (item.dataset.quality === "low" || item.dataset.playable === "false");
    item.hidden = shouldHide;
    if (shouldHide) {
      hiddenCount += 1;
    }
  }

  const visibleCount = items.length - hiddenCount;
  copyAllButton.disabled = visibleCount === 0;
  resultMeta.textContent = hiddenCount
    ? `${lastResultText} ${visibleCount} shown, ${hiddenCount} hidden by filter.`
    : lastResultText;
}

function getVisibleItems() {
  return [...linksContainer.querySelectorAll(".link-item")].filter((item) => !item.hidden);
}

function updateAddress(url, method) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("url", url);
  nextUrl.searchParams.set("method", method);
  window.history.replaceState({}, "", nextUrl);
}

function getSelectedMethod() {
  return new FormData(form).get("method") || "fetch";
}

function updateBookmarkletLink() {
  bookmarkletLink.href = buildLauncherScript(getSelectedMethod());
}

function buildLauncherScript(method) {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return `javascript:(()=>{window.open(${JSON.stringify(baseUrl)}+'?url='+encodeURIComponent(location.href)+'&method=${encodeURIComponent(method)}','_blank','noopener')})()`;
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "," && event.key !== ".") {
    return;
  }

  if (isTypingTarget(event.target)) {
    return;
  }

  const video = getActiveVideo();
  if (!video || !Number.isFinite(video.duration)) {
    return;
  }

  event.preventDefault();
  activeVideo = video;
  video.pause();
  stepVideo(video, event.key === "." ? FRAME_STEP_SECONDS : -FRAME_STEP_SECONDS);
});

function setupVideoControls(root, video) {
  const slider = root.querySelector(".seek-preview");
  const fill = root.querySelector(".seek-fill");
  const hover = root.querySelector(".seek-hover");
  const preview = root.querySelector(".frame-preview");
  const canvas = preview.querySelector("canvas");
  const time = preview.querySelector("span");
  const ctx = canvas.getContext("2d");
  const thumbnailVideo = document.createElement("video");
  const pipBtn = root.querySelector(".pip-btn");
  const fullscreenBtn = root.querySelector(".fullscreen-btn");
  let isDragging = false;
  let pendingPreviewTime = null;

  thumbnailVideo.muted = true;
  thumbnailVideo.preload = "metadata";
  thumbnailVideo.playsInline = true;

  if (pipBtn) {
    if (!document.pictureInPictureEnabled) {
      pipBtn.hidden = true;
    } else {
      pipBtn.addEventListener("click", async () => {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      });
    }
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    });
  }


  video.addEventListener("loadedmetadata", () => {
    slider.setAttribute("aria-valuemax", String(Math.floor(video.duration)));
    updateTimeline(video, fill, slider);
  });

  video.addEventListener("timeupdate", () => updateTimeline(video, fill, slider));
  video.addEventListener("durationchange", () => updateTimeline(video, fill, slider));
  video.addEventListener("focus", () => {
    activeVideo = video;
  });
  video.addEventListener("pointerdown", () => {
    activeVideo = video;
  });
  video.addEventListener("mouseenter", () => {
    activeVideo = video;
  });
  video.addEventListener("play", () => {
    activeVideo = video;
  });

  slider.addEventListener("focus", () => {
    activeVideo = video;
  });

  slider.addEventListener("pointerenter", () => {
    activeVideo = video;
    if (!thumbnailVideo.src) {
      thumbnailVideo.src = video.currentSrc || video.src;
    }
  });

  slider.addEventListener("pointermove", (event) => {
    if (!Number.isFinite(video.duration)) {
      return;
    }

    const percent = getPointerPercent(slider, event.clientX);
    const previewTime = percent * video.duration;
    positionPreview(preview, hover, percent);
    preview.hidden = false;
    time.textContent = formatTime(previewTime);
    drawThumbnail(thumbnailVideo, ctx, previewTime, (nextTime) => {
      pendingPreviewTime = nextTime;
    });

    if (isDragging) {
      seekVideo(video, previewTime);
    }
  });

  slider.addEventListener("pointerdown", (event) => {
    if (!Number.isFinite(video.duration)) {
      return;
    }

    isDragging = true;
    slider.setPointerCapture(event.pointerId);
    activeVideo = video;
    seekVideo(video, getPointerPercent(slider, event.clientX) * video.duration);
  });

  slider.addEventListener("pointerup", (event) => {
    isDragging = false;
    if (slider.hasPointerCapture(event.pointerId)) {
      slider.releasePointerCapture(event.pointerId);
    }
  });

  slider.addEventListener("pointercancel", () => {
    isDragging = false;
    preview.hidden = true;
  });

  slider.addEventListener("pointerleave", () => {
    if (!isDragging) {
      preview.hidden = true;
      hover.style.width = "0%";
    }
  });

  slider.addEventListener("keydown", (event) => {
    if (!Number.isFinite(video.duration)) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      activeVideo = video;
      stepVideo(video, event.key === "ArrowRight" ? 5 : -5);
    }
  });

  thumbnailVideo.addEventListener("seeked", () => {
    if (!preview.hidden) {
      paintThumbnail(thumbnailVideo, ctx);
    }

    if (pendingPreviewTime !== null) {
      const nextTime = pendingPreviewTime;
      pendingPreviewTime = null;
      drawThumbnail(thumbnailVideo, ctx, nextTime, (queuedTime) => {
        pendingPreviewTime = queuedTime;
      });
    }
  });
}

function updateTimeline(video, fill, slider) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    fill.style.width = "0%";
    slider.setAttribute("aria-valuenow", "0");
    return;
  }

  const percent = Math.max(0, Math.min(1, video.currentTime / video.duration));
  fill.style.width = `${percent * 100}%`;
  slider.setAttribute("aria-valuenow", String(Math.floor(video.currentTime)));
  slider.setAttribute("aria-valuetext", `${formatTime(video.currentTime)} of ${formatTime(video.duration)}`);
}

function getPointerPercent(element, clientX) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function positionPreview(preview, hover, percent) {
  const boundedPercent = Math.max(0, Math.min(1, percent));
  preview.style.left = `clamp(88px, ${boundedPercent * 100}%, calc(100% - 88px))`;
  hover.style.width = `${boundedPercent * 100}%`;
}

function drawThumbnail(video, ctx, seconds, queuePending) {
  if (!video.src || video.readyState < HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  if (Math.abs(video.currentTime - seconds) < 0.05) {
    paintThumbnail(video, ctx);
    return;
  }

  if (video.seeking) {
    queuePending(seconds);
    return;
  }

  video.currentTime = seconds;
}

function paintThumbnail(video, ctx) {
  try {
    ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
  } catch {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

function seekVideo(video, seconds) {
  const target = Math.max(0, Math.min(video.duration || 0, seconds));
  if (typeof video.fastSeek === "function") {
    video.fastSeek(target);
    return;
  }

  video.currentTime = target;
}

function stepVideo(video, seconds) {
  const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  video.currentTime = target;
}

function getActiveVideo() {
  const focusedVideo = document.activeElement?.closest?.(".link-item")?.querySelector(".preview");
  return focusedVideo || activeVideo || document.querySelector(".preview");
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target?.isContentEditable;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Scanning..." : "Scan";
}

function setMessage(text, isError) {
  message.textContent = text;
  message.hidden = text.length === 0;
  message.classList.toggle("error", isError);
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
