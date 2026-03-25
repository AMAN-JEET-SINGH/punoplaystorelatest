const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT_DIR = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const IMAGE_HOST = process.env.IMAGE_HOST || "";

const LOCAL_GAMES_DIR = path.join(ROOT_DIR, "games");
const USE_LOCAL_IMAGES =
  process.env.USE_LOCAL_IMAGES != null
    ? String(process.env.USE_LOCAL_IMAGES) === "1"
    : fs.existsSync(LOCAL_GAMES_DIR);

function getGamesImageBaseUrl(packageId) {
  if (USE_LOCAL_IMAGES) {
    return `/games/${encodeURIComponent(packageId)}`;
  }

  // VPS public URL fallback (if you host images under /images/games):
  //   ${IMAGE_HOST}/images/games/<packageId>/...
  if (!IMAGE_HOST) return `/games/${encodeURIComponent(packageId)}`;
  return `${IMAGE_HOST}/images/games/${encodeURIComponent(packageId)}`;
}

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function safeJoin(base, target) {
  const targetPath = path.normalize(target).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(base, targetPath);
}

function slugToTitle(slug) {
  return decodeURIComponent(slug)
    .replace(/--+/g, "-")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyName(name) {
  return String(name || "")
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatOverviewText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "Overview not available.";
  // Escape to avoid HTML injection, then preserve line breaks.
  return escapeHtml(raw).replace(/\n/g, "<br/>");
}

function normalizeIosStoreUrl(maybeUrl) {
  const s = String(maybeUrl ?? "").trim();
  if (!s) return "";
  // On desktop browsers, `itms-appss://...` can fail with
  // "scheme does not have a registered handler".
  return s
    .replace(/^itms-appss:\/\//i, "https://")
    .replace(/^itms-apps:\/\//i, "https://");
}

function stripHtmlTags(s) {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function loadTemplate() {
  const templatePath = path.join(ROOT_DIR, "views", "game_v2.html");
  return fs.readFileSync(templatePath, "utf8");
}

const template = loadTemplate();

function loadIndexTemplate() {
  const templatePath = path.join(ROOT_DIR, "views", "index_template.html");
  return fs.readFileSync(templatePath, "utf8");
}

const indexTemplate = loadIndexTemplate();

function loadGamesJson() {
  const filteredPath = path.join(ROOT_DIR, "appmaster.games.filtered.json");
  const fallbackPath = path.join(ROOT_DIR, "appmaster.games.json");

  const jsonPath =
    fs.existsSync(filteredPath) &&
    (process.env.USE_FILTERED_JSON === "1" ||
      process.env.USE_FILTERED_JSON == null)
      ? filteredPath
      : fallbackPath;

  const raw = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

const gamesList = loadGamesJson();
const gamesBySlug = new Map();
for (const g of gamesList) {
  const slug = slugifyName(g?.name);
  if (!slug) continue;
  if (!gamesBySlug.has(slug)) gamesBySlug.set(slug, g);
}

function loadDownloadTemplate() {
  const templatePath = path.join(ROOT_DIR, "views", "download_template.html");
  return fs.readFileSync(templatePath, "utf8");
}

const downloadTemplate = loadDownloadTemplate();

function renderGamePage({ slug, game }) {
  const safeSlug = slug.replace(/[^\w\-]/g, "");
  const title = game?.name || slugToTitle(slug);
  const packageId = game?.gameId || safeSlug;

  const imageBaseUrl = getGamesImageBaseUrl(packageId);

  // Requirement: icon.webp from the same folder.
  const iconUrl = `${imageBaseUrl}/icon.webp`;

  // Requirement: screenshot count comes from `screenshots` array length.
  const screenshotCount = Array.isArray(game?.screenshots)
    ? game.screenshots.length
    : 0;

  const overviewHtml = formatOverviewText(game?.editorsReview);

  return template
    .replaceAll("__TITLE__", escapeHtml(title))
    .replaceAll("__SLUG__", safeSlug)
    .replaceAll("__ICON__", escapeHtml(iconUrl))
    .replaceAll("__IMAGE_BASE__", imageBaseUrl)
    .replaceAll("__OG_URL__", `/game/${safeSlug}`)
    .replaceAll("__DOWNLOAD_HREF__", `/download/${safeSlug}`)
    .replaceAll("__DEVELOPER__", escapeHtml(game?.developer || ""))
    .replaceAll("__SCORE__", escapeHtml(game?.rating ?? ""))
    .replaceAll("__DOWNLOADS__", escapeHtml(game?.installs || ""))
    .replaceAll("__AGE__", escapeHtml(game?.age || ""))
    .replaceAll("__VERSION__", escapeHtml(game?.updated || "Latest"))
    .replaceAll("__PRICE__", escapeHtml(game?.price || "Free"))
    .replaceAll("__SCREENSHOT_COUNT__", String(screenshotCount))
    .replaceAll("__OVERVIEW__", overviewHtml);
}

function buildHomeGameCards(gamesList) {
  function isHotGame({ name, slug }) {
    const n = String(name || "").toLowerCase();
    const s = String(slug || "").toLowerCase();

    // Normalize common variations (gameId folders are by package, but UI uses slug).
    const matchAny = (arr) => arr.some((x) => s.includes(x) || n.includes(x));

    return matchAny([
      "ludo-king",
      "pokemon-go",
      "candy-crush",
      "stumble-guys",
      "pubg",
      "subway-surfer",
      "subway-surfers",
      "minecraft",
      "roblox",
    ]);
  }

  // Put HOT apps first, then render the rest.
  const hotGames = [];
  const otherGames = [];

  for (const g of gamesList) {
    const name = g?.name || "";
    const slug = slugifyName(name);
    const hot = isHotGame({ name, slug });
    if (hot) hotGames.push(g);
    else otherGames.push(g);
  }

  const ordered = hotGames.concat(otherGames);

  return ordered
    .map((g, idx) => {
      const name = g?.name || "";
      const slug = slugifyName(name);
      const gameId = g?.gameId || "";
      if (!slug || !gameId) return "";

      const imageBaseUrl = getGamesImageBaseUrl(gameId);
      const iconUrl = `${imageBaseUrl}/icon.webp`;

      // Match your provided index.css grid layout.
      // - first card uses .item-1
      // - second card uses .item-2
      const itemClass =
        idx === 0
          ? "game-item item-1"
          : idx === 1
            ? "game-item item-2"
            : "game-item";

      const hot = isHotGame({ name, slug });
      const hotClass = hot ? " hot-game" : "";
      // Use a valid inline placeholder so the first paint doesn't show a broken image.
      // (Some deployments might not have `/assets/img/empty.gif`.)
      const EMPTY_GIF =
        "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

      return `<a class="${itemClass}${hotClass}" href="/game/${slug}">
  ${hot ? `<img class="hot-badge" src="/assets/image/hot.png" alt="HOT" loading="lazy" />` : ""}
  <div class="game-icon">
    <img class="lazy-img" data-original="${iconUrl}" src="${EMPTY_GIF}" />
  </div>
  <span class="game-title text-ellipsis-2">${escapeHtml(name)}</span>
</a>`;
    })
    .filter(Boolean)
    .join("\n");
}

function renderDownloadPage({ slug, game }) {
  const safeSlug = slug.replace(/[^\w\-]/g, "");
  const title = slugToTitle(slug);

  const packageId = game?.gameId || safeSlug;
  const imageBaseUrl = getGamesImageBaseUrl(packageId);
  const iconUrl = `${imageBaseUrl}/icon.webp`;
  const screenshotCount = Array.isArray(game?.screenshots)
    ? game.screenshots.length
    : 0;

  const androidUrl = game?.source?.android || "#";
  const iosUrl = normalizeIosStoreUrl(game?.source?.ios) || "#";

  return downloadTemplate
    .replaceAll("__TITLE__", escapeHtml(title || safeSlug))
    .replaceAll("__SLUG__", safeSlug)
    .replaceAll("__ICON__", escapeHtml(iconUrl))
    .replaceAll("__IMAGE_BASE__", escapeHtml(imageBaseUrl))
    .replaceAll("__SCREENSHOT_COUNT__", String(screenshotCount))
    .replaceAll("__OG_URL__", `/download/${safeSlug}`)
    .replaceAll("__DOWNLOAD_HREF__", `/download/${safeSlug}`)
    .replaceAll("__DEVELOPER__", escapeHtml(game?.developer || ""))
    .replaceAll("__SCORE__", escapeHtml(game?.rating ?? ""))
    .replaceAll("__DOWNLOADS__", escapeHtml(game?.installs || ""))
    .replaceAll("__AGE__", escapeHtml(game?.age || ""))
    .replaceAll("__VERSION__", escapeHtml(game?.updated || "Latest"))
    .replaceAll("__PRICE__", escapeHtml(game?.price || "Free"))
    .replaceAll("__ANDROID_URL__", escapeHtml(androidUrl))
    .replaceAll("__IOS_URL__", escapeHtml(iosUrl));
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || "/";

  // JSON endpoints used by client-side scripts inside templates.
  // Handle these before the generic "/assets/" static file handler.
  if (pathname === "/games.json") {
    const payload = gamesList
      .map((g) => {
        const name = g?.name || "";
        const slug = slugifyName(name);
        const pkg = g?.gameId || slug;
        const imageBaseUrl = getGamesImageBaseUrl(pkg);
        if (!name || !slug) return null;
        return {
          title: name,
          icon: `${imageBaseUrl}/icon.webp`,
          url: `/game/${slug}`,
        };
      })
      .filter(Boolean);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify(payload));
  }

  if (pathname === "/assets/css/onlinegames.json") {
    const payload = gamesList
      .map((g) => {
        const title = g?.name || "";
        const category = g?.category || "";
        const id = g?.gameId || "";
        const slug = slugifyName(title);
        const pkg = id || slug;
        const imageBaseUrl = getGamesImageBaseUrl(pkg);
        if (!title || !id) return null;
        return {
          id,
          thumb: `${imageBaseUrl}/icon.webp`,
          title,
          category,
          url: slug ? `/game/${slug}` : "#",
        };
      })
      .filter(Boolean);

    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify(payload));
  }

  // Basic static asset serving.
  if (pathname.startsWith("/assets/")) {
    const rel = pathname.replace(/^\/+/, "");
    const filePath = safeJoin(ROOT_DIR, rel);
    return serveFile(res, filePath);
  }

  // Serve local game media from ./games/<packageId>/
  if (USE_LOCAL_IMAGES && pathname.startsWith("/games/")) {
    const rel = pathname.replace(/^\/+/, "");
    const filePath = safeJoin(ROOT_DIR, rel); // ./games/<packageId>/...
    return serveFile(res, filePath);
  }

  if (pathname === "/" || pathname === "/index.html") {
    const cardsHtml = buildHomeGameCards(gamesList);
    const html = indexTemplate.replaceAll("__GAME_CARDS__", cardsHtml);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(html);
  }

  const gameMatch = pathname.match(/^\/game\/([^/]+)$/i);
  if (gameMatch) {
    const slug = gameMatch[1];
    const game = gamesBySlug.get(slug) || null;
    const html = renderGamePage({ slug, game });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(html);
  }

  const downloadMatch = pathname.match(/^\/download\/([^/]+)$/i);
  if (downloadMatch) {
    const slug = downloadMatch[1];
    const game = gamesBySlug.get(slug) || null;
    return res.end(renderDownloadPage({ slug, game }));
  }

  // Static legal pages (Privacy Policy, Terms of Use, About Us)
  const lowerPath = String(pathname).toLowerCase();
  if (lowerPath === "/page/privacy-policy/") {
    return serveFile(res, path.join(ROOT_DIR, "views", "privacy_policy.html"));
  }
  if (lowerPath === "/page/terms-of-use/") {
    return serveFile(res, path.join(ROOT_DIR, "views", "terms_of_use.html"));
  }
  if (lowerPath === "/page/about-us/" || lowerPath === "/page/about-us") {
    return serveFile(res, path.join(ROOT_DIR, "views", "about_us.html"));
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(`Cannot GET ${pathname}`);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running: http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Try: http://localhost:${PORT}/game/Poppy-Playtime-Chapter-1`);
});

