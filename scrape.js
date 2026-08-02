// scrape.js
// This little robot visits FruityBlox's stock page, reads the current
// Normal + Mirage stock, and saves it into stock.json in this same folder.
// GitHub Actions runs this file automatically on a schedule (see
// .github/workflows/update-stock.yml) — you never need to run it yourself.

const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

const SOURCE_URL = "https://fruityblox.com/stock";

async function scrapeStock() {
  const { data: html } = await axios.get(SOURCE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  const sections = { normal: [], mirage: [] };
  let currentSection = null;

  $("body")
    .find("h2, a")
    .each((_, el) => {
      const tag = $(el).prop("tagName");

      if (tag === "H2") {
        const heading = $(el).text().trim().toLowerCase();
        if (heading.includes("normal")) currentSection = "normal";
        else if (heading.includes("mirage")) currentSection = "mirage";
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
  }
  if (!name) return null;

  const rarityMatch = text.match(/(Natural|Elemental|Beast|Zoan|Logia|Paramecia)/i);
  const rarity = rarityMatch ? rarityMatch[1] : null;

  const beliMatch = text.match(/([\d,]+)R/);
  const beli = beliMatch ? Number(beliMatch[1].replace(/,/g, "")) : null;

  const robuxMatch = text.match(/R\s*([\d,]+)\s*$/);
  const robux = robuxMatch ? Number(robuxMatch[1].replace(/,/g, "")) : null;

  return { name, rarity, beli, robux };
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
