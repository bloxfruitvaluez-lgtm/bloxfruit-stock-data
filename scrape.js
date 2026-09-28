// scrape.js
// This little robot asks Firecrawl to fetch FruityBlox's stock page (so
// the request doesn't come from GitHub's own blocked server address),
// reads the Normal + Mirage fruit lists out of the result, and saves
// them into stock.json. GitHub Actions runs this automatically on a
// schedule (see .github/workflows/update-stock.yml).
//
// Safety: if anything looks wrong, the robot stops WITHOUT touching
// stock.json, so your website keeps showing the last good stock.

const fs = require("fs");
const axios = require("axios");

const TARGET_URL = "https://fruityblox.com/stock";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

// A few fruit names use a hyphen on your own site's database.
const NAME_FIXES = { "T Rex": "T-Rex" };

// Ask Firecrawl for the page as markdown text.
// maxAge: 0  -> always fetch a fresh copy (never an old saved one)
// proxy: "basic" -> the cheapest mode (1 credit per fetch)
async function fetchMarkdown() {
  const res = await axios.post(
    "https://api.firecrawl.dev/v2/scrape",
    { url: TARGET_URL, formats: ["markdown"], maxAge: 0, proxy: "basic" },
    {
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  const doc = res.data && res.data.data;
  if (!doc || !doc.markdown) throw new Error("Firecrawl returned no page content");

  const meta = doc.metadata || {};
  if (meta.statusCode && meta.statusCode !== 200) {
    throw new Error(`FruityBlox answered with status ${meta.statusCode}`);
  }
  console.log(`Firecrawl OK — credits used: ${meta.creditsUsed}, cache: ${meta.cacheState}`);
  return doc.markdown;
}

// Grab the text under a heading like "## Normal" up to the next "## ".
function getSection(markdown, title) {
  const heading = new RegExp("^##\\s+" + title + "\\s*$", "mi").exec(markdown);
  if (!heading) return "";
  const rest = markdown.slice(heading.index + heading[0].length);
  const next = rest.search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

// Each fruit looks like:  **Rocket** Natural  5,000R 50](https://fruityblox.com/items/rocket)
function parseFruits(text) {
  const pattern =
    /\*\*(.+?)\*\*\s*([A-Za-z]+)[\s\\]*([\d,]+)R\s*([\d,]+)\]\(https?:\/\/fruityblox\.com\/items\/[^)\s]+\)/g;
  const fruits = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    let name = m[1].trim();
    if (NAME_FIXES[name]) name = NAME_FIXES[name];
    fruits.push({
      name,
      rarity: m[2],
      beli: Number(m[3].replace(/,/g, "")),
      robux: Number(m[4].replace(/,/g, "")),
    });
  }
  return fruits;
}

function parseStock(markdown) {
  const normal = parseFruits(getSection(markdown, "Normal"));
  const mirage = parseFruits(getSection(markdown, "Mirage"));
  if (normal.length === 0 || mirage.length === 0) {
    throw new Error(
      `Could not read the stock lists (Normal: ${normal.length}, Mirage: ${mirage.length}) — the page layout may have changed.`
    );
  }
  return { normal, mirage };
}

// Try up to 2 times; skip the retry when the problem is the key or credits.
async function scrapeWithRetry(attempts = 2) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return parseStock(await fetchMarkdown());
    } catch (err) {
      lastErr = err;
      const status = err.response && err.response.status;
      const detail = err.response && err.response.data && err.response.data.error;
      console.error(`Attempt ${i} failed: ${err.message}${detail ? " — " + detail : ""}`);
      if (status === 401 || status === 402) break;
      if (i < attempts) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

async function main() {
  try {
    if (!FIRECRAWL_API_KEY) {
      throw new Error("Missing FIRECRAWL_API_KEY (check the GitHub secret and the workflow file)");
    }

    const stock = await scrapeWithRetry();

    const output = {
      lastUpdated: new Date().toISOString(),
      source: TARGET_URL,
      normal: stock.normal,
      mirage: stock.mirage,
    };

    fs.writeFileSync("stock.json", JSON.stringify(output, null, 2));
    console.log("stock.json updated successfully:", output);
  } catch (err) {
    console.error("Scrape failed:", err.message);
    process.exit(1);
  }
}

module.exports = { parseStock };
if (require.main === module) main();
