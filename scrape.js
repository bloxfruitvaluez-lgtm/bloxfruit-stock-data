// scrape.js
// This little robot visits FruityBlox's stock page — routed through
// ScraperAPI's proxy so the request doesn't come from GitHub's own
// (blocked) server address — and pulls out a clean, ready-made list of
// current fruits that's already embedded in the page's own code. It
// saves the result into stock.json. GitHub Actions runs this file
// automatically on a schedule (see .github/workflows/update-stock.yml)
// — you never need to run it yourself.

const fs = require("fs");
const axios = require("axios");

const TARGET_URL = "https://fruityblox.com/stock";
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

function buildProxyUrl() {
  const params = new URLSearchParams({
    api_key: SCRAPERAPI_KEY,
    url: TARGET_URL,
  });
  return `http://api.scraperapi.com/?${params.toString()}`;
}

async function scrapeStock() {
  const { data: html } = await axios.get(buildProxyUrl(), {
    timeout: 30000,
  });

  const match = html.match(/\\?"normal\\?":(\[.*?\]),\\?"mirage\\?":(\[.*?\])\}\]/);
  if (!match) {
    throw new Error("Could not find the stock data block in the page — FruityBlox may have changed its layout.");
  }

  const normalRaw = match[1].replace(/\\"/g, '"');
  const mirageRaw = match[2].replace(/\\"/g, '"');

  const normal = JSON.parse(normalRaw);
  const mirage = JSON.parse(mirageRaw);

  return {
    normal: normal.map(formatFruit),
    mirage: mirage.map(formatFruit),
  };
}

function formatFruit(f) {
  let name = f.name || null;
  const hyphenatedNames = { "T Rex": "T-Rex" };
  if (name && hyphenatedNames[name]) name = hyphenatedNames[name];

  return {
    name,
    rarity: f.type || null,
    beli: f.price ?? null,
    robux: f.robuxPrice ?? null,
  };
}

async function main() {
  try {
    if (!SCRAPERAPI_KEY) throw new Error("Missing SCRAPERAPI_KEY (check the repo secret and workflow env)");

    const stock = await scrapeStock();

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

main();
