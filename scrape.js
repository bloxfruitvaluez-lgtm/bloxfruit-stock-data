// scrape.js
// This little robot visits the Blox Fruits Fandom wiki's Stock page,
// reads the current Normal + Mirage stock, and saves it into stock.json
// in this same folder. GitHub Actions runs this file automatically on a
// schedule (see .github/workflows/update-stock.yml) — you never need to
// run it yourself.

const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

const SOURCE_URL = "https://blox-fruits.fandom.com/wiki/Stock";

async function scrapeStock() {
  const { data: html } = await axios.get(SOURCE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    timeout: 15000,
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
        if (heading.includes("normal dealer")) currentSection = "normal";
        else if (heading.includes("mirage dealer")) currentSection = "mirage";
        else currentSection = null;
        return;
      }

      if (tag === "A" && currentSection) {
        const href = $(el).attr("href") || "";
        if (!href.includes("/wiki/")) return;
        if (href.includes(":")) return;

        const rawText = $(el).text().trim();
        if (!rawText) return;

        const parsed = parseFruitLink(rawText, href);
        if (parsed) sections[currentSection].push(parsed);
      }
    });

  sections.normal = dedupe(sections.normal);
  sections.mirage = dedupe(sections.mirage);

  return sections;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseFruitLink(text, href) {
  let name = text.replace(/\s+/g, " ").trim();

  if (!name) {
    const slug = decodeURIComponent(href.split("/wiki/")[1] || "");
    name = slug.replace(/_/g, " ").trim();
  }
  if (!name) return null;

  return { name };
}

async function main() {
  try {
    const stock = await scrapeStock();

    const output = {
      lastUpdated: new Date().toISOString(),
      source: SOURCE_URL,
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
