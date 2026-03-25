const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "appmaster.games.filtered.json");
const GAMES_DIR = path.join(ROOT, "games");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function main() {
  const raw = fs.readFileSync(INPUT, "utf8");
  const list = JSON.parse(raw);

  let missingFolder = 0;
  let missingIcon = 0;
  let missingShot0 = 0;
  let missingShots = 0;

  const examples = [];

  for (const g of list) {
    const gameId = g?.gameId;
    const folder = path.join(GAMES_DIR, gameId || "");
    const icon = path.join(folder, "icon.webp");

    if (!exists(folder)) missingFolder++;
    if (!exists(icon)) missingIcon++;

    const shotsArr = Array.isArray(g?.screenshots) ? g.screenshots : null;
    const needCount = shotsArr ? shotsArr.length : 0;
    if (needCount > 0) {
      const shot0 = path.join(folder, "screenshot-0.webp");
      if (!exists(shot0)) missingShot0++;

      for (let i = 0; i < needCount; i++) {
        const p = path.join(folder, `screenshot-${i}.webp`);
        if (!exists(p)) {
          missingShots++;
          if (examples.length < 5) {
            examples.push({
              name: g?.name,
              gameId,
              needCount,
              missingIndex: i,
            });
          }
          break;
        }
      }
    }
  }

  console.log({
    total: list.length,
    missingFolder,
    missingIcon,
    missingShot0,
    missingShots,
    examples,
  });
}

main();

