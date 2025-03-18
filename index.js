import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import { executablePath } from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3005;

// Apply Puppeteer plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

app.use(cors());
app.use(express.json());

app.get("/api/scrape", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    console.log(`[INFO] Scraping URL: ${url}`);

    // Launch Puppeteer using Render’s Chromium
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: executablePath(), // Use system Chromium
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280x1024",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    console.log("[INFO] Navigating to page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("[INFO] Extracting JSON-LD data...");
    const jsonLdDataArray = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(script => script.textContent)
        .map(text => {
          try {
            return JSON.parse(text);
          } catch (err) {
            return null;
          }
        })
        .filter(data => data);
    });

    await browser.close();

    if (!jsonLdDataArray.length) {
      return res.status(404).json({ error: "No JSON-LD data found" });
    }

    // Extract event offers
    const eventData = jsonLdDataArray.flat().find(item => item["@type"] === "Event" && item.offers);
    if (!eventData || !eventData.offers) {
      return res.status(404).json({ error: "No offers found in JSON-LD data" });
    }

    const offers = eventData.offers.map(offer => ({
      name: offer.name,
      price: offer.price,
      availability: offer.availability,
      inventoryLevel: offer.inventoryLevel || "0",
      validFrom: offer.validFrom,
    }));

    return res.json({ offers });
  } catch (error) {
    console.error("[ERROR] Scraping error:", error.message);
    return res.status(500).json({ error: "Failed to scrape the website", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
