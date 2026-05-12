<p align="center">
  <img src="public/banner.svg" alt="ClipSnare banner" width="100%" />
</p>

ClipSnare is a simple and powerful tool designed to extract direct MP4 video links from web pages. It provides a clean web interface to scan URLs, preview videos, and easily copy links for use in other applications.

## How It Works

ClipSnare offers two scanning modes:

- **Fast Scan** — Fetches the raw HTML/JSON of a page via HTTP and extracts `.mp4` URLs from the source. Fast, but misses videos loaded dynamically by JavaScript.
- **Deep Scan** — Launches a headless Chromium browser via Playwright, renders the page fully, and intercepts network requests to capture video URLs that only appear at runtime.

For supported sites (currently Reddit), ClipSnare applies site-specific rules — for example, converting Reddit post URLs to their JSON API endpoint and extracting `v.redd.it` DASH video links automatically.

## Features

- **Dual Scanning Modes:** Fast Scan for speed, Deep Scan for completeness.
- **Video Previews:** Preview found videos inline with a custom seek bar and thumbnail previews on hover.
- **Quality Filtering:** Automatically detect and hide low-quality (< 480p) or unplayable links.
- **Keyboard Shortcuts:**
  - `,` / `.` — Step frame-by-frame (previous / next) on the active video.
  - `Left` / `Right` arrows — Jump 5 seconds on the focused seek bar.
- **URL Privacy:** The URL input is masked by default (password field) with a toggle to show/hide — useful when sharing your screen.
- **Shareable Scans:** The address bar updates with `?url=...&method=...` so you can bookmark or share a scan URL directly.
- **Batch Actions:** Copy all visible links to your clipboard with a single click.
- **Reddit Support:** Automatically handles Reddit's DASH video format by fetching the JSON API and resolving `v.redd.it` links.
- **Bookmarklet:** Drag the "Send Current Tab" link from the UI to your bookmarks bar. Click it on any page to open ClipSnare with that page pre-filled.
- **Docker Ready:** Includes a `Dockerfile` and `compose.yml` for easy deployment.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:papesce/clipsnare.git
    cd clipsnare
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Install Playwright browser (required for Deep Scan):**
    ```bash
    npx playwright install chromium
    ```

### Running the Application

Start the server:
```bash
npm start
```
The application will be available at `http://localhost:5173`.

### Environment Variables

- `PORT`: The port the server listens on (default: `5173`).
- `HOST`: The host interface to bind to (default: `127.0.0.1`, or `0.0.0.0` in production).

## API

ClipSnare exposes a single endpoint that you can call directly from scripts or other tools:

```
GET /api/extract?url=<page-url>&method=fetch|browser
```

Response:
```json
{
  "sourceUrl": "https://example.com/page",
  "method": "fetch",
  "count": 2,
  "links": [
    { "url": "https://cdn.example.com/video.mp4", "host": "cdn.example.com", "filename": "video.mp4" }
  ],
  "warnings": []
}
```

## Using Docker

The Docker image is based on `mcr.microsoft.com/playwright`, which includes Chromium out of the box — no separate `npx playwright install` step is needed.

### Docker Compose (Recommended)

```bash
docker compose up -d
```
This will build the image and start the container on port `5173`.

### Manual Docker Build

1.  **Build the image:**
    ```bash
    docker build -t clipsnare .
    ```

2.  **Run the container:**
    ```bash
    docker run -p 5173:5173 clipsnare
    ```

### Version Pinning

The Playwright version in `package.json` (`1.59.1`) and the Docker base image (`playwright:v1.59.1-noble`) must match. If you upgrade one, update the other to avoid browser compatibility issues.

## Development

The project is built with:
- **Backend:** Node.js (ES Modules), zero dependencies beyond Playwright
- **Frontend:** Vanilla JavaScript, HTML5, and CSS3
- **Automation:** Playwright (for headless Chromium in Deep Scan)

## License

Private / Internal use.
