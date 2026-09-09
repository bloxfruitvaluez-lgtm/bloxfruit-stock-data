// scrape.js
// This little robot visits FruityBlox's stock page — routed through a
// proxy service so the request doesn't come from GitHub's own (blocked)
// server address — reads the current Normal + Mirage stock, and saves
// it into stock.json. GitHub Actions runs this automatically on a
// schedule (see .github/workflows/update-stock.yml).

const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

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

  const $ = cheerio.load(html);

  const sections = { normal: [], mirage: [] };
  let currentSection = null;

  $("body")
    .find("h1, h2, h3, h4, a")
    .each((_, el) => {
      const tag = $(el).prop("tagName");

      if (tag !== "A") {
        const heading = $(el).text().trim().toLowerCase();
        if (heading === "normal") currentSection = "normal";
        else if (heading === "mirage") currentSection = "mirage";
        else currentSection = null;
        return;
      }

      if (tag === "A" && currentSection) {
        const href = $(el).attr("href") || "";
        if (!href.includes("/items/")) return;

        const rawText = $(el).text().trim();
        if (!rawText) return;

        const parsed = parseFruitText(rawText, href);
        if (parsed) sections[currentSection].push(parsed);
      }
    });

  return sections;
}

function parseFruitText(text, href) {
  let name = null;
  const slug = href.split("/items/")[1];
  if (slug) {
    name = slug
      .replace(/\/$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const hyphenatedNames = { "T Rex": "T-Rex" };
    if (hyphenatedNames[name]) name = hyphenatedNames[name];
  }
  if (!name) return null;

  const rarityMatch = text.match(/(Natural|Elemental|Beast|Zoan|Logia|Paramecia)/i);
  const rarity = rarityMatch ? rarityMatch[1] : null;

  const beliMatch = text.match(/([\d,]+)R/);
  const beli = beliMatch ? Number(beliMatch[1].replace(/,/g, "")) :
