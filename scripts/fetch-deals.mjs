// Builds site/deals.json from public deal RSS feeds plus a hand-curated baseline.
// Runs in GitHub Actions on a schedule. No dependencies; needs Node 20+.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const FEEDS = [
  { name: "Slickdeals Frontpage", url: "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1", hot: true },
  { name: "Slickdeals Popular", url: "https://slickdeals.net/newsearch.php?mode=popdeals&searcharea=deals&searchin=first&rss=1" },
  { name: "DealNews", url: "https://www.dealnews.com/?rss=1&sort=time" },
  { name: "9to5Toys", url: "https://9to5toys.com/feed/" },
  // Keyword searches widen coverage of popular categories beyond the front page.
  ...[
    ["TVs", "tv"], ["Video games", "video game"], ["PS5", "ps5"], ["Xbox", "xbox"], ["Nintendo Switch", "nintendo switch"],
    ["Laptops", "laptop"], ["Headphones", "headphones"], ["Apple", "apple"], ["Vacuums", "vacuum"],
    ["Kitchen", "air fryer"], ["Toys", "lego"], ["Smartwatches", "smartwatch"],
    ["Clothing", "clothing"], ["Nike", "nike"], ["Lululemon", "lululemon"], ["Old Navy & Gap", "old navy"],
    ["Beauty", "beauty"], ["Sephora", "sephora"], ["Ulta", "ulta"], ["Skincare", "skincare"],
    ["Fitness", "fitness"], ["Camping", "camping"], ["Golf", "golf"], ["Luggage", "luggage"],
  ].map(([label, q]) => ({ name: `Slickdeals: ${label}`, url: `https://slickdeals.net/newsearch.php?q=${encodeURIComponent(q)}&searcharea=deals&searchin=first&rss=1` })),
];

const CURATED_SOURCES = [
  { name: "MacRumors", url: "https://www.macrumors.com/2026/11/21/apple-black-friday-deals-available-now-2026/" },
  { name: "9to5Toys", url: "https://9to5toys.com/2026/11/18/official-2026-best-buy-black-friday-sale-now-live/" },
  { name: "9to5Toys", url: "https://9to5toys.com/2026/11/22/amazon-2026-black-friday-week-day-4-new-deals/" },
  { name: "The Kitchn", url: "https://www.thekitchn.com/best-small-appliance-black-friday-cyber-monday-deals-2026-23854752" },
  { name: "dealnews", url: "https://www.dealnews.com/On-Black-Friday-Deals-at-Dicks-Sporting-Goods-Up-to-82-off-free-shipping-w-49/22415320.html" },
  { name: "dealnews", url: "https://www.dealnews.com/Dicks-Sporting-Goods-Black-Friday-Sale-Up-to-80-off-free-shipping-w-49/22420862.html" },
  { name: "NBC Select", url: "https://www.nbcnews.com/select/shopping/best-black-friday-deals-11-26-2026-rcna611358" },
  { name: "Good Housekeeping", url: "https://shopping.yahoo.com/style/luggage/articles/tested-75-luggage-brands-best-190654301.html" },
  { name: "Holafly", url: "https://esim.holafly.com/travel-tips/black-friday-suitcase-deals/" },
  { name: "TravelBinger", url: "https://travelbinger.com/black-friday-2026-luggage-and-tech-deals-arrive-early" },
  { name: "Good Morning America", url: "https://www.goodmorningamerica.com/shop/story/black-friday-fashion-deals-2026-138116529" },
  { name: "Dappered", url: "https://dappered.com/2026/11/black-friday-2026-the-best-style-deals-for-men/" },
  { name: "Forbes", url: "https://www.forbes.com/sites/forbes-personal-shopper/2026/11/25/best-black-friday-clothing-deals/" },
  { name: "Washington Times", url: "https://www.washingtontimes.com/news/2026/nov/23/black-friday-2026-running-list-major-retailers-sales-plans/" },
  { name: "Good Morning America", url: "https://www.goodmorningamerica.com/shop/story/black-friday-beauty-deals-2026-138216373" },
  { name: "NewBeauty", url: "https://www.newbeauty.com/view/black-friday-cyber-monday-beauty-sales-2026" },
  { name: "HELLO!", url: "https://www.hellomagazine.com/shopping/935745/best-beauty-black-friday-deals-2026/" },
  { name: "Chowhound", url: "https://www.chowhound.com/2321513/black-friday-deals-you-shouldnt-miss-costco-2026/" },
  { name: "Costco Guides", url: "https://costcoguides.com/costco-black-friday-sale/" },
  { name: "NBC Select", url: "https://www.nbcnews.com/select/shopping/home-depot-black-friday-sale-2026-rcna611349" },
  { name: "Fortune", url: "https://fortune.com/article/best-black-friday-fitness-deals-2026/" },
  { name: "MassLive", url: "https://shopping.yahoo.com/style/clothing/articles/65-off-during-abercrombie-fitch-143210350.html" },
  { name: "Feminegra", url: "https://feminegra.com/15-sitewide-black-friday-sales-worth-shopping-in-2026-from-as-ever-to-fenty-beauty/" },
  { name: "Forbes", url: "https://www.forbes.com/sites/forbes-personal-shopper/2026/11/26/best-black-friday-deals/" },
];

const MAX_AGE_DAYS = 5;
const MAX_LIVE = 900;

const BRANDS = ["Dyson", "Ninja", "KitchenAid", "Anker", "Logitech", "Bose", "Sony", "JBL", "Samsung", "Apple", "Dell", "HP", "Lenovo", "Nike", "Adidas"];
const STORES = [
  "Amazon", "Best Buy", "Walmart", "Target", "Costco", "Sam's Club", "Home Depot", "Lowe's", "Kohl's", "Macy's",
  "Newegg", "B&H", "Adorama", "Micro Center", "Dell", "HP", "Lenovo", "Apple", "Samsung", "Google Store",
  "eBay", "Woot", "Staples", "Office Depot", "GameStop", "Nike", "Adidas", "Under Armour", "REI", "Dick's Sporting Goods",
  "Nordstrom", "Old Navy", "Gap", "Ulta", "Sephora", "Wayfair", "Overstock", "Bed Bath & Beyond", "Dyson", "Ninja",
  "KitchenAid", "QVC", "Verizon", "AT&T", "T-Mobile", "Steam", "Epic Games", "PlayStation Store", "Xbox", "Nintendo",
  "Kohls", "Lowes", "BJ's", "Meijer", "Ace Hardware", "Harbor Freight", "Chewy", "Petco", "Zappos", "J.Crew",
  "Levi's", "Columbia", "The North Face", "Lululemon", "Crocs", "Academy Sports", "Bass Pro Shops", "Cabela's",
  "Abercrombie", "American Eagle", "Banana Republic", "Athleta", "Madewell", "Uniqlo", "Zappos", "Saks", "Bloomingdale's",
  "Dermstore", "Kiehl's", "Clinique", "Estee Lauder", "Samsonite", "Away", "Monos", "Calpak", "Tumi", "Expedia", "Anker", "Logitech", "Bose", "Sony", "JBL", "Monoprice",
];
const STORE_ALIASES = { "Kohls": "Kohl's", "Lowes": "Lowe's", "Dicks": "Dick's Sporting Goods", "Dick's": "Dick's Sporting Goods", "DSG": "Dick's Sporting Goods", "Ulta Beauty": "Ulta", "Amazon.com": "Amazon", "BestBuy": "Best Buy", "Bestbuy": "Best Buy", "Walmart.com": "Walmart" };

const CATEGORIES = [
  ["Apple", /\b(airpods?|airtag|apple watch|ipad|iphone|macbook|mac mini|mac studio|imac|apple pencil|homepod|apple tv)\b/i],
  ["Travel", /\b(luggage|suitcases?|carry-?on|checked bag|packing cubes?|duffel|weekender|travel (bag|backpack|pillow|adapter|kit|case|organizer|bottle)|samsonite|tumi|calpak|monos|away (the|bigger|carry)|beis|rimowa|travelpro|airfare|cruises?|vacation package)\b/i],
  ["Gaming", /\b(ps5|playstation|xbox|nintendo|switch 2|switch|steam deck|dualsense|gaming|game pass|controller|video game|meta quest|rog ally)\b/i],
  ["TV & Audio", /\b(tv|oled|qled|soundbar|headphones?|earbuds?|speaker|roku|fire tv|chromecast|projector|turntable|subwoofer|sonos|bose|jbl|beats)\b/i],
  ["Phones", /\b(galaxy s\d|galaxy z|pixel \d|smartphone|phone|smartwatch|pixel watch|galaxy watch|garmin|fitbit)\b/i],
  ["Computers", /\b(laptop|chromebook|notebook|desktop pc|gaming pc|monitor|tablet|galaxy tab|ssd|nvme|hard drive|gpu|graphics card|rtx|radeon|ryzen|intel core|cpu|motherboard|ram|ddr5|router|mesh|nas|printer|camera)\b/i],
  ["Accessories", /\b(charger|charging|power bank|usb-?c|cable|keyboard|mouse|dock|hub|case|screen protector|magsafe|qi2|microsd|flash drive|webcam)\b/i],
  ["Kitchen", /\b(air fryer|blender|mixer|kitchenaid|instant pot|pressure cooker|coffee|espresso|keurig|nespresso|cookware|skillet|knife|toaster|kettle|ninja|vitamix|food processor|microwave|grill|griddle|cuisinart|le creuset)\b/i],
  ["Beauty", /\b(skin ?care|makeup|serum|moisturi[sz]er|cleanser|sunscreen|spf|retinol|lip (balm|gloss|oil|mask|liner)|lipstick|mascara|foundation|concealer|eyeshadow|blush|bronzer|perfume|fragrance|eau de|cologne|shampoo|(?<!air )conditioner|hair (dryer|mask|oil|tool)|airwrap|supersonic|airstrait|flexstyle|straightener|curling|led (face )?mask|face mask|nail polish|sephora|ulta|beauty|cosmetics|shaver|razor|(?<!hedge |string |weed )trimmer|toothbrush|oral-b|sonicare)\b/i],
  ["Home", /\b(vacuum|roomba|robot vacuum|dyson|shark|mattress|sheets|pillow|bedding|towel|furniture|sofa|lamp|air purifier|humidifier|heater|fan|smart lock|doorbell|ring|security camera|thermostat|echo|alexa|google home|nest|light bulb|cleaner|mop|drill|tool set|dewalt|milwaukee|ryobi|generator)\b/i],
  ["Toys", /\b(lego|toy|toys|barbie|hot wheels|nerf|board game|puzzle|playset|plush|kids)\b/i],
  ["Clothing", /\b(backpacks?|jackets?|coats?|parka|puffer|vest|fleece|hoodies?|sweatshirts?|sweaters?|cardigan|shirts?|tees?|t-shirts?|polo|jeans|pants|trousers|chinos|leggings|joggers|shorts|dress(es)?|skirt|bra|underwear|pajamas|loungewear|shoes|sneakers|boots|slippers|clogs|socks|apparel|clothing|activewear|handbag|purse|tote|wallet|belt|scarf|beanie|gloves|nike|adidas|lululemon|old navy|gap|banana republic|j\.?crew|madewell|abercrombie|levi'?s|north face|columbia|patagonia|ugg|crocs|hoka|new balance|vans|converse|alo|vuori|spanx|skims|coach)\b/i],
  ["Sporting Goods", /\b(camping|tent|sleeping bag|hiking|backpacking|kayak|paddle ?board|bike|bicycle|e-bike|scooter|cooler|yeti|stanley|hydro flask|golf|fishing|hunting|treadmill|rower|rowing machine|exercise bike|elliptical|fitness|dumbbells?|kettlebells?|weight bench|squat rack|yoga mat|resistance bands|peloton|bowflex|theragun|massage gun|basketball|football|soccer|baseball|softball|tennis|pickleball|racquet|ski|skis|snowboard|sled|trampoline|hoop|cleats|sporting goods)\b/i],
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

// Store-wide sales ("40% off sitewide", "50% off everything") and promo codes ("w/ code SAVE20").
const SITEWIDE = /\b(site-?wide|store-?wide|\d{1,2}%\s*off\s+(everything|(your\s+)?(entire|whole)\s+(order|purchase|site|store)|all\s+orders))\b/i;
const isSitewide = title => SITEWIDE.test(title);
function findCode(text) {
  const m = text.match(/\b(?:[Pp]romo |[Cc]oupon |[Dd]iscount )?[Cc]ode:?\s+["“']?([A-Z0-9][A-Z0-9-]{3,19})\b/);
  return m && /[A-Z]/.test(m[1]) ? m[1] : undefined;
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

// Phrases deal writers use when a price beats or matches past prices.
const SIGNALS = [
  ["low", /\b(all[- ]time low|lowest (price )?(ever|on record|we'?ve (ever )?(seen|tracked))|record low|new low|best[- ]ever (price|deal|discount)|never been (this )?(cheaper|lower)|lowest price (yet|to date))\b/i],
  ["match", /\b(matches?( the| its)? (prime day|previous|all[- ]time|lowest|best)|returns? to( the| its)? (low|lowest|all[- ]time)|(back|down) to( its)? (low|lowest)|same (price|deal) as (prime day|last))\b/i],
];
function priceSignal(text) {
  const hit = SIGNALS.find(([, re]) => re.test(text));
  return hit ? hit[0] : undefined;
}

// Price history: one entry per product (across stores), updated every run and committed back by the workflow.
const HISTORY_URL = new URL("../data/history.json", import.meta.url);
const MAX_POINTS = 120;
async function loadHistory() {
  try { return JSON.parse(await readFile(HISTORY_URL, "utf8")); } catch { return {}; }
}
function recordPrice(history, d, day) {
  if (d.p == null || d.p <= 0) return null;
  const k = keyOf(d.t);
  const h = history[k] || (history[k] = { t: d.t, pts: [] });
  const before = h.pts.length ? h.pts.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
  const firstDay = h.pts.length ? h.pts[0][0] : day;
  const last = h.pts[h.pts.length - 1];
  if (!last || last[0] !== day || last[1] !== d.p || last[2] !== d.s) h.pts.push([day, d.p, d.s]);
  if (h.pts.length > MAX_POINTS) h.pts.splice(0, h.pts.length - MAX_POINTS);
  const high = before ? Math.max(...h.pts.slice(0, -1).map(x => x[1])) : null;
  return { before, high, firstDay, days: new Set(h.pts.map(x => x[0])).size };
}

// Turns what we know into a verdict: great / good / ok / meh, with a one-line reason.
function verdict(d, hist) {
  if (d.sw) return null; // Store-wide sales have no single price to judge.
  const days = hist ? hist.days : 0;
  const prev = hist && hist.before;
  if (prev && days >= 2 && d.p != null) {
    if (d.p < prev[1] * 0.98) return { v: "great", why: `Lowest we've tracked (previous low ${usd(prev[1])} at ${prev[2]})`, lo: prev[1], loAt: prev[2], loDay: prev[0] };
    if (d.p > prev[1] * 1.05) return { v: "meh", why: `Was ${usd(prev[1])} at ${prev[2]} on ${shortDay(prev[0])}`, lo: prev[1], loAt: prev[2], loDay: prev[0] };
  }
  const low = d.sig === "low" || /all[- ]time low|record low|best[- ]ever|new low|lowest price/i.test(d.n || "");
  const match = d.sig === "match" || /match/i.test(d.n || "");
  const extra = prev && days >= 2 ? { lo: prev[1], loAt: prev[2], loDay: prev[0] } : {};
  if (low) return { v: "great", why: "Reported as an all-time low", ...extra };
  if (match) return { v: "good", why: "Matches its previous best price", ...extra };
  const pct = d.p != null && d.w ? Math.round((1 - d.p / d.w) * 100) : d.d || 0;
  // A price that has never moved tells us nothing; only call it good if it was higher before and came back down.
  if (prev && days >= 2 && hist.high > d.p * 1.05) return { v: "good", why: `Back down to its lowest tracked price (was up to ${usd(hist.high)})`, ...extra };
  if (pct >= 40) return { v: "good", why: `${pct}% below the regular price` };
  if (pct > 0 && pct < 15) return { v: "ok", why: "Only a small discount off the regular price" };
  return null;
}
const usd = n => "$" + (n % 1 ? n.toFixed(2) : n.toLocaleString("en-US"));
const shortDay = day => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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
        sig: priceSignal(it.title + " " + it.desc),
        sw: isSitewide(it.title) ? 1 : undefined,
        code: findCode(it.title + " " + it.desc),
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
    return { ...rest, u: d.u || src.url, src: src.name, direct: !!d.u, curated: 1, at: d.at || "2026-11-22T22:00:00Z" };
  });
  sources.push({ name: "Hand-picked roundups (Nov 22–26)", url: CURATED_SOURCES[0].url, ok: true, count: curated.length });

  const history = await loadHistory();
  const day = new Date(now).toISOString().slice(0, 10);
  const deals = [...liveDeals.map(d => ({ ...d, direct: false })), ...curated].map(d => {
    const hist = recordPrice(history, d, day);
    const v = verdict(d, hist);
    const { sig, ...rest } = d;
    return v ? { ...rest, ...v } : rest;
  });
  await writeFile(HISTORY_URL, JSON.stringify(history));
  const counts = deals.reduce((a, d) => (a[d.v || "none"] = (a[d.v || "none"] || 0) + 1, a), {});
  console.log("Verdicts:", JSON.stringify(counts), "| products tracked:", Object.keys(history).length);
  const out = { updated: new Date(now).toISOString(), sources, deals };
  await mkdir(new URL("../site/", import.meta.url), { recursive: true });
  await writeFile(new URL("../site/deals.json", import.meta.url), JSON.stringify(out));
  console.log(`Wrote ${deals.length} deals (${liveDeals.length} live, ${curated.length} curated).`);
}

export { parseFeed, extractPrices, isSitewide, findCode, findStore, findCategory, cleanTitle, priceSignal, verdict, recordPrice };
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
