// Builds site/deals.json from public deal RSS feeds plus a hand-curated baseline.
// Runs in GitHub Actions on a schedule. No dependencies; needs Node 20+.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const FEEDS = [
  { name: "Slickdeals Frontpage", url: "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1", hot: true },
  { name: "Slickdeals Popular", url: "https://slickdeals.net/newsearch.php?mode=popdeals&searcharea=deals&searchin=first&rss=1" },
  { name: "DealNews", url: "https://www.dealnews.com/?rss=1&sort=time" },
  { name: "9to5Toys", url: "https://9to5toys.com/feed/" },
  { name: "Ben's Bargains", url: "https://www.bensbargains.com/rss.php" },
];

const CURATED_SOURCES = [
  { name: "MacRumors", url: "https://www.macrumors.com/2026/11/21/apple-black-friday-deals-available-now-2026/" },
  { name: "9to5Toys", url: "https://9to5toys.com/2026/11/18/official-2026-best-buy-black-friday-sale-now-live/" },
  { name: "9to5Toys", url: "https://9to5toys.com/2026/11/22/amazon-2026-black-friday-week-day-4-new-deals/" },
  { name: "The Kitchn", url: "https://www.thekitchn.com/best-small-appliance-black-friday-cyber-monday-deals-2026-23854752" },
];

const MAX_AGE_DAYS = 5;
const MAX_LIVE = 400;

const BRANDS = ["Dyson", "Ninja", "KitchenAid", "Anker", "Logitech", "Bose", "Sony", "JBL", "Samsung", "Apple", "Dell", "HP", "Lenovo", "Nike", "Adidas"];
const STORES = [
  "Amazon", "Best Buy", "Walmart", "Target", "Costco", "Sam's Club", "Home Depot", "Lowe's", "Kohl's", "Macy's",
  "Newegg", "B&H", "Adorama", "Micro Center", "Dell", "HP", "Lenovo", "Apple", "Samsung", "Google Store",
  "eBay", "Woot", "Staples", "Office Depot", "GameStop", "Nike", "Adidas", "Under Armour", "REI", "Dick's Sporting Goods",
  "Nordstrom", "Old Navy", "Gap", "Ulta", "Sephora", "Wayfair", "Overstock", "Bed Bath & Beyond", "Dyson", "Ninja",
  "KitchenAid", "QVC", "Verizon", "AT&T", "T-Mobile", "Steam", "Epic Games", "PlayStation Store", "Xbox", "Nintendo",
  "Kohls", "Lowes", "BJ's", "Meijer", "Ace Hardware", "Harbor Freight", "Chewy", "Petco", "Zappos", "J.Crew",
  "Levi's", "Columbia", "The North Face", "Lululemon", "Crocs", "Anker", "Logitech", "Bose", "Sony", "JBL", "Monoprice",
];
const STORE_ALIASES = { "Kohls": "Kohl's", "Lowes": "Lowe's", "Dicks": "Dick's Sporting Goods", "Amazon.com": "Amazon", "BestBuy": "Best Buy", "Bestbuy": "Best Buy", "Walmart.com": "Walmart" };

const CATEGORIES = [
  ["Apple", /\b(airpods?|airtag|apple watch|ipad|iphone|macbook|mac mini|mac studio|imac|apple pencil|homepod|apple tv)\b/i],
  ["Gaming", /\b(ps5|playstation|xbox|nintendo|switch 2|switch|steam deck|dualsense|gaming|game pass|controller|video game|meta quest|rog ally)\b/i],
  ["TV & Audio", /\b(tv|oled|qled|soundbar|headphones?|earbuds?|speaker|roku|fire tv|chromecast|projector|turntable|subwoofer|sonos|bose|jbl|beats)\b/i],
  ["Phones", /\b(galaxy s\d|galaxy z|pixel \d|smartphone|phone|smartwatch|pixel watch|galaxy watch|garmin|fitbit)\b/i],
  ["Computers", /\b(laptop|chromebook|notebook|desktop pc|gaming pc|monitor|tablet|galaxy tab|ssd|nvme|hard drive|gpu|graphics card|rtx|radeon|ryzen|intel core|cpu|motherboard|ram|ddr5|router|mesh|nas|printer|camera)\b/i],
  ["Accessories", /\b(charger|charging|power bank|usb-?c|cable|keyboard|mouse|dock|hub|case|screen protector|magsafe|qi2|microsd|flash drive|webcam)\b/i],
  ["Kitchen", /\b(air fryer|blender|mixer|kitchenaid|instant pot|pressure cooker|coffee|espresso|keurig|nespresso|cookware|skillet|knife|toaster|kettle|ninja|vitamix|food processor|microwave|grill|griddle|cuisinart|le creuset)\b/i],
  ["Home", /\b(vacuum|roomba|robot vacuum|dyson|shark|mattress|sheets|pillow|bedding|towel|furniture|sofa|lamp|air purifier|humidifier|heater|fan|smart lock|doorbell|ring|security camera|thermostat|echo|alexa|google home|nest|light bulb|cleaner|mop|drill|tool set|dewalt|milwaukee|ryobi|generator)\b/i],
  ["Toys", /\b(lego|toy|toys|barbie|hot wheels|nerf|board game|puzzle|playset|plush|kids)\b/i],
  ["Beauty", /\b(skincare|makeup|serum|perfume|fragrance|cologne|hair dryer|straightener|curling|shaver|razor|trimmer|toothbrush|oral-b|sonicare)\b/i],
  ["Fashion", /\b(jacket|coat|hoodie|sweater|shirt|jeans|pants|shoes|sneakers|boots|socks|apparel|clothing|backpack|handbag|wallet|watch band|nike|adidas|levi'?s|north face|columbia|ugg)\b/i],
  ["Outdoors", /\b(camping|tent|hiking|kayak|bike|bicycle|e-bike|scooter|cooler|yeti|stanley|golf|fishing|treadmill|fitness|dumbbell|peloton)\b/i],
];

const decode = (s = "") => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const stripTags = (s = "") => decode(decode(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? m[1] : ""; };

function parseFeed(xml) {
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(m => m[0]);
  return items.map(it => {
    const rawDesc = tag(it, "description") || tag(it, "content:encoded");
    const img = (it.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i) || it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) || decode(rawDesc).match(/<img[^>]*src="([^"]+)"/i) || [])[1];
    return {
      title: stripTags(tag(it, "title")),
      link: stripTags(tag(it, "link")) || stripTags(tag(it, "guid")),
      date: new Date(stripTags(tag(it, "pubDate")) || stripTags(tag(it, "dc:date")) || Date.now()),
      desc: stripTags(rawDesc).slice(0, 600),
      img: img ? decode(img) : undefined,
    };
  }).filter(i => i.title && i.link);
}

const money = s => +s.replace(/[$,]/g, "");
function extractPrices(title, desc) {
  const t = title.replace(/(\d),(\d{3})/g, "$1$2");
  const d = desc.replace(/(\d),(\d{3})/g, "$1$2");
  let p = null, w = null, pct = null;
  const free = /\bfree\b(?!\s+(shipping|s&h|pickup|store pickup|delivery|returns|gift))/i.test(title) && !/\$\d/.test(title);
  const nums = [...t.matchAll(/\$(\d+(?:\.\d{1,2})?)(?![\d.])(?!\s*(?:off|gift card|credit|back|in rewards|reward|promo))/gi)].map(m => money(m[1]));
  if (nums.length) p = nums[0];
  if (free) p = 0;
  const reg = (t + " " + d).match(/(?:reg\.?|regularly|was|list(?: price)?|orig(?:inal(?:ly)?)?\.?|msrp|retail)\s*:?\s*\$(\d+(?:\.\d{1,2})?)/i);
  if (reg) w = money(reg[1]);
  const off = t.match(/\$(\d+(?:\.\d{1,2})?)\s*off/i);
  if (!w && off && p != null) w = p + money(off[1]);
  const pm = t.match(/(\d{1,2})%\s*off/i);
  if (pm) pct = +pm[1];
  if (p != null && w && w > p) pct = Math.round((1 - p / w) * 100);
  if (w && p != null && w <= p) w = null;
  return { p, w, pct };
}

function findStore(title, desc) {
  const hay = title + " | " + desc;
  const at = title.match(/(?:\bat\b|@|\bvia\b|\bfrom\b)\s+([A-Z][\w&'.]*(?:\s+[A-Z&][\w&'.]*){0,3})/);
  const candidates = [...STORES, ...Object.keys(STORE_ALIASES)];
  const norm = x => STORE_ALIASES[x] || x;
  if (at) {
    const hit = candidates.find(s => at[1].toLowerCase().startsWith(s.toLowerCase()));
    if (hit) return norm(hit);
  }
  let best = null, bestIdx = Infinity;
  for (const s of candidates.filter(c => !BRANDS.includes(c))) {
    const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = hay.match(re);
    if (m && m.index < bestIdx) { best = s; bestIdx = m.index; }
  }
  if (best) return norm(best);
  const brand = BRANDS.find(b => new RegExp(`\\b${b}\\b`, "i").test(hay));
  return brand || "Other";
}

const findCategory = (title, desc) => (CATEGORIES.find(([, re]) => re.test(title)) || CATEGORIES.find(([, re]) => re.test(desc)) || ["Other"])[0];

function cleanTitle(t) {
  return t.replace(/\s*\+\s*free (shipping|s\/h|store pickup).*$/i, "")
    .replace(/\s+\(?(?:at|@)\s+[A-Z][\w&'.]*(?:\s+[A-Z][\w&'.]*){0,3}\)?\s*$/, "")
    .trim();
}

async function fetchFeed(feed) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(feed.url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; black-friday-deals-board/1.0; +https://github.com)", Accept: "application/rss+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text());
    if (!items.length) throw new Error("no items");
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: String(e.message || e), items: [] };
  } finally { clearTimeout(timer); }
}

const keyOf = t => t.toLowerCase().replace(/\$[\d.,]+/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 8).join(" ");

async function main() {
  const now = Date.now();
  const sources = [];
  const live = [];
  const results = await Promise.all(FEEDS.map(fetchFeed));
  results.forEach((r, i) => {
    const feed = FEEDS[i];
    let n = 0;
    for (const it of r.items) {
      if (now - it.date.getTime() > MAX_AGE_DAYS * 864e5) continue;
      const { p, w, pct } = extractPrices(it.title, it.desc);
      const t = cleanTitle(it.title);
      if (t.length < 8) continue;
      live.push({
        t, s: findStore(it.title, it.desc), c: findCategory(t, it.desc),
        p: p ?? undefined, w: w ?? undefined, d: pct && !(p != null && w) ? pct : undefined,
        u: it.link, src: feed.name, at: it.date.toISOString(), img: it.img,
        hot: feed.hot && pct >= 40 ? 1 : undefined,
      });
      n++;
    }
    sources.push({ name: feed.name, url: feed.url, ok: r.ok, count: n, error: r.ok ? undefined : r.error });
    console.log(`${feed.name}: ${r.ok ? n + " deals" : "FAILED " + r.error}`);
  });

  // Dedupe live deals (same product across feeds), newest first.
  live.sort((a, b) => b.at.localeCompare(a.at));
  const seen = new Set();
  const liveDeals = live.filter(d => { const k = keyOf(d.t); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX_LIVE);

  const curated = JSON.parse(await readFile(new URL("../data/curated.json", import.meta.url), "utf8")).map(d => {
    const src = CURATED_SOURCES[d.r] || CURATED_SOURCES[0];
    const { r, ...rest } = d;
    return { ...rest, u: d.u || src.url, src: src.name, direct: !!d.u, curated: 1, at: "2026-11-22T22:00:00Z" };
  });
  sources.push({ name: "Hand-picked roundups (Nov 22)", url: CURATED_SOURCES[0].url, ok: true, count: curated.length });

  const deals = [...liveDeals.map(d => ({ ...d, direct: false })), ...curated];
  const out = { updated: new Date(now).toISOString(), sources, deals };
  await mkdir(new URL("../site/", import.meta.url), { recursive: true });
  await writeFile(new URL("../site/deals.json", import.meta.url), JSON.stringify(out));
  console.log(`Wrote ${deals.length} deals (${liveDeals.length} live, ${curated.length} curated).`);
}

export { parseFeed, extractPrices, findStore, findCategory, cleanTitle };
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
