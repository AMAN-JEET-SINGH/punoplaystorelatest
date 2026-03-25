const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const INPUT = process.env.INPUT || path.join(PROJECT_ROOT, "appmaster.games.json");
const OUTPUT =
  process.env.OUTPUT || path.join(PROJECT_ROOT, "appmaster.games.filtered.json");
const GAMES_DIR = path.join(PROJECT_ROOT, "games");

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function listScreenshotWebps(gameFolder) {
  try {
    const entries = fs.readdirSync(gameFolder, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /^screenshot-\d+\.webp$/i.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function main() {
  if (!fileExists(INPUT)) {
    console.error(`Input JSON not found: ${INPUT}`);
    process.exit(1);
  }
  if (!fileExists(GAMES_DIR)) {
    console.error(`Games directory not found: ${GAMES_DIR}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT, "utf8");
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) {
    console.error(`Input JSON must be an array`);
    process.exit(1);
  }

  let kept = 0;
  let dropped = 0;
  const droppedExamples = [];

  const filtered = [];
  for (const g of list) {
    const gameId = g?.gameId;
    const name = g?.name || "";
    if (!gameId) {
      dropped++;
      if (droppedExamples.length < 10) droppedExamples.push({ name, reason: "missing gameId" });
      continue;
    }

    const folder = path.join(GAMES_DIR, gameId);
    const iconPath = path.join(folder, "icon.webp");

    const screenshots = listScreenshotWebps(folder);
    const hasIcon = fileExists(iconPath);
    const hasAnyScreenshot = screenshots.length > 0;

    if (hasIcon && hasAnyScreenshot) {
      filtered.push(g);
      kept++;
    } else {
      dropped++;
      if (droppedExamples.length < 10) {
        droppedExamples.push({
          name,
          gameId,
          reason: !hasIcon ? "missing icon.webp" : "missing screenshot-*.webp",
        });
      }
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(filtered, null, 2), "utf8");

  console.log("Filter complete");
  console.log(`Input:   ${INPUT}`);
  console.log(`Output:  ${OUTPUT}`);
  console.log(`Total:   ${list.length}`);
  console.log(`Kept:    ${kept}`);
  console.log(`Dropped: ${dropped}`);
  if (droppedExamples.length) {
    console.log("Dropped examples (up to 10):");
    for (const ex of droppedExamples) console.log(" -", ex);
  }
}

main();

