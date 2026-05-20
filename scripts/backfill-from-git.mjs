// Backfill every May 2026 article into the cf-archive D1 by walking every
// commit on denseupdates/cfnetworkpulse that touched news.html or gossip.html.
// We extract every <div class="card card--article"> from news.html and every
// <a class="gossip-card"> from gossip.html, union by slug (= the id attribute
// on news, the URL hash on gossip), and POST the merged set to /ingest.
//
// Why this works: even if an article was published on May 5 and removed from
// the site by May 18, its commit history still has the article block. By
// unioning across ALL commits in the month, we recover every article that
// ever existed in the month, regardless of whether it's still live.
//
// Usage:
//   REPO_PATH=/tmp/cfnetworkpulse \
//   INGEST_URL=https://cf-archive-api.denseupdates.workers.dev/ingest \
//   INGEST_TOKEN=... \
//   MONTH=2026-05 \
//   node scripts/backfill-from-git.mjs
//
// Add --dry-run to print the merged set without POSTing.

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const REPO         = process.env.REPO_PATH    || "/tmp/cfnetworkpulse";
const INGEST_URL   = process.env.INGEST_URL   || "";
const INGEST_TOKEN = process.env.INGEST_TOKEN || "";
const MONTH        = process.env.MONTH        || "2026-05";
const SITE         = process.env.SITE_ORIGIN  || "https://cfnetworknews.com";
const DRY          = process.argv.includes("--dry-run");
const OUT          = process.env.OUT_PATH     || "/tmp/cf-may-backfill.json";

const [year, monStr] = MONTH.split("-");
const mon = +monStr;
const since = `${year}-${monStr}-01`;
const until = new Date(Date.UTC(+year, mon, 1)).toISOString().slice(0, 10);

function git(args, opts = {}) {
  return execSync(`git -C "${REPO}" ${args}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

// ---- find commits that touched either file ----
const commitsRaw = git(`log --since="${since}" --until="${until}" --pretty=format:"%H %ai" -- news.html gossip.html`)
  .trim().split("\n").filter(Boolean);
console.log(`Found ${commitsRaw.length} commits touching news.html or gossip.html in ${MONTH}`);

const commits = commitsRaw.map(line => {
  const [hash, ...rest] = line.split(" ");
  return { hash, when: rest.join(" ") };
});

// ---- walk each commit, parse out every card by slug ----
const articles = new Map();   // slug -> { ...best record so far }
const gossips  = new Map();   // slug -> { ... }

function readAtCommit(hash, path) {
  try { return git(`show ${hash}:${path}`); } catch { return null; }
}

function parseDate(str) {
  if (!str) return null;
  // "May 19, 2026" → "2026-05-19"
  const m = str.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})/i);
  if (!m) return null;
  const months = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  return `${m[3]}-${months[m[1].slice(0,3).toLowerCase()]}-${String(+m[2]).padStart(2,"0")}`;
}

function stripTags(s) {
  return (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

// ---- news.html: <div id="slug" class="card card--article ..."> ----
const CARD_OPEN = /<div\s+id="([^"]+)"\s+class="card card--article[^"]*"[^>]*>/gi;

function extractArticleBlocks(html) {
  const out = [];
  if (!html) return out;
  let m;
  CARD_OPEN.lastIndex = 0;
  while ((m = CARD_OPEN.exec(html)) !== null) {
    const slug = m[1];
    const start = m.index;
    // Walk forward, counting <div> depth, to find the matching </div>.
    let depth = 1;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = m.index + m[0].length;
    let end = -1, t;
    while ((t = tagRe.exec(html)) !== null) {
      if (t[0].startsWith("</")) { depth--; if (depth === 0) { end = t.index + t[0].length; break; } }
      else depth++;
    }
    if (end < 0) continue;
    out.push({ slug, block: html.slice(start, end) });
  }
  return out;
}

// ---- gossip.html: <a href="./gossip.html#slug" class="gossip-card"> ... </a> ----
const GOSSIP_OPEN = /<a\s+href="\.?\/?gossip\.html#([^"]+)"\s+class="gossip-card"[^>]*>/gi;

function extractGossipBlocks(html) {
  const out = [];
  if (!html) return out;
  let m;
  GOSSIP_OPEN.lastIndex = 0;
  while ((m = GOSSIP_OPEN.exec(html)) !== null) {
    const slug = m[1];
    const start = m.index;
    // <a> in this file does not nest; closing </a> is the next one.
    const closeIdx = html.indexOf("</a>", m.index + m[0].length);
    if (closeIdx < 0) continue;
    out.push({ slug, block: html.slice(start, closeIdx + 4) });
  }
  return out;
}

function parseArticleBlock(slug, block, commitDate) {
  const title = stripTags(pick(block, /<h3[^>]*class="card__title"[^>]*>([\s\S]*?)<\/h3>/i));
  const dateStr = stripTags(pick(block, /<span[^>]*class="card__date"[^>]*>([\s\S]*?)<\/span>/i));
  const tag = stripTags(pick(block, /<span[^>]*class="card__tag"[^>]*>([\s\S]*?)<\/span>/i));
  const excerpt = stripTags(pick(block, /<p[^>]*class="card__excerpt"[^>]*>([\s\S]*?)<\/p>/i));
  const imgUrl = pick(block, /<img[^>]*class="card__image-img"[^>]*src="([^"]+)"/i)
              || pick(block, /<img[^>]*src="([^"]+)"[^>]*class="card__image-img"/i)
              || pick(block, /<img[^>]*src="([^"]+)"/i);
  const publishedAt = parseDate(dateStr) || commitDate;
  return {
    slug, title, excerpt, tag_label: tag || "Top Story",
    category: mapCategory(tag),
    image_url: imgUrl ? absUrl(imgUrl) : null,
    image_alt: title,
    canonical_url: `${SITE}/news.html#${slug}`,
    source_page: "news.html",
    published_at: publishedAt,
  };
}

function parseGossipBlock(slug, block, commitDate) {
  const title = stripTags(pick(block, /<h3[^>]*class="gossip-card__title"[^>]*>([\s\S]*?)<\/h3>/i));
  const label = stripTags(pick(block, /<div[^>]*class="gossip-card__label"[^>]*>([\s\S]*?)<\/div>/i));
  const text  = stripTags(pick(block, /<p[^>]*class="gossip-card__text"[^>]*>([\s\S]*?)<\/p>/i));
  const imgUrl = pick(block, /<img[^>]*src="([^"]+)"/i);
  return {
    slug, title, excerpt: text,
    tag_label: label || "Gossip",
    category: "Gossip & Drama",
    image_url: imgUrl ? absUrl(imgUrl) : null,
    image_alt: title,
    canonical_url: `${SITE}/gossip.html#${slug}`,
    source_page: "gossip.html",
    published_at: commitDate, // gossip.html doesn't carry a per-card date; use commit date
  };
}

function mapCategory(tag) {
  const t = (tag || "").toLowerCase();
  if (t.includes("top"))      return "Top Stories";
  if (t.includes("compet"))   return "Competitions";
  if (t.includes("open"))     return "The Open";
  if (t.includes("games"))    return "2026 Games";
  if (t.includes("rank"))     return "Rankings";
  if (t.includes("rogue"))    return "Rogue Fitness";
  if (t.includes("show"))     return "Today's Shows";
  return "Top Stories";
}

function absUrl(u) {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return SITE + u;
  // Repo relative — e.g. "Abigail Domit.jpg" → SITE/Abigail Domit.jpg
  return SITE + "/" + u.replace(/^\.\//, "");
}

// ---- walk every commit, merge "best" record per slug ----
// "Best" = the first time we saw the article (newest commit, since git log is
// reverse-chronological). That's the most-current copy of its text. But we
// also remember the EARLIEST commit date so published_at reflects when it
// actually went live, not when it was last edited.

const earliestCommit = new Map(); // slug -> earliest ISO date

for (const c of commits) {
  const commitDate = c.when.slice(0, 10);
  const newsHtml   = readAtCommit(c.hash, "news.html");
  const gossipHtml = readAtCommit(c.hash, "gossip.html");

  for (const { slug, block } of extractArticleBlocks(newsHtml)) {
    if (!articles.has(slug)) articles.set(slug, parseArticleBlock(slug, block, commitDate));
    const prev = earliestCommit.get(slug);
    if (!prev || commitDate < prev) earliestCommit.set(slug, commitDate);
  }
  for (const { slug, block } of extractGossipBlocks(gossipHtml)) {
    if (!gossips.has(slug)) gossips.set(slug, parseGossipBlock(slug, block, commitDate));
    const prev = earliestCommit.get("g:" + slug);
    if (!prev || commitDate < prev) earliestCommit.set("g:" + slug, commitDate);
  }
}

// Backfill earliest-seen as published_at if the block didn't carry a date,
// AND filter to month.
const all = [];
for (const [slug, rec] of articles) {
  rec.published_at = rec.published_at || earliestCommit.get(slug);
  if ((rec.published_at || "").startsWith(MONTH)) all.push(rec);
}
for (const [slug, rec] of gossips) {
  rec.published_at = rec.published_at || earliestCommit.get("g:" + slug);
  if ((rec.published_at || "").startsWith(MONTH)) all.push(rec);
}

all.sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));

console.log(`\nMerged ${all.length} unique May 2026 items:`);
for (const r of all) {
  console.log(`  ${r.published_at}  [${r.category.padEnd(14)}]  ${r.slug}  \u2014 ${r.title?.slice(0, 60) || "(no title)"}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ month: MONTH, articles: all }, null, 2));
console.log(`\nWrote ${OUT}`);

if (DRY) { console.log("\n(dry run — not posting to /ingest)"); process.exit(0); }
if (!INGEST_URL || !INGEST_TOKEN) {
  console.error("\nINGEST_URL and INGEST_TOKEN env vars required for non-dry runs.");
  process.exit(1);
}

console.log(`\nPOSTing ${all.length} articles to ${INGEST_URL} ...`);
try {
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-token": INGEST_TOKEN },
    body: JSON.stringify({
      articles: all,
      run_type: "backfill",
      source: `git:${MONTH}`,
      notes: `backfill-from-git.mjs for ${MONTH} (${all.length} items)`,
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${txt.slice(0, 500)}`);
    process.exit(1);
  }
  const data = JSON.parse(txt);
  console.log(`\nDone. inserted=${data.inserted} updated=${data.updated} errored=${data.errored}`);
  if (data.errored && Array.isArray(data.results)) {
    for (const r of data.results) if (!r.ok) console.error(`  \u2717 ${r.error}`);
  }
} catch (err) {
  console.error(`Bulk POST failed: ${err.message}`);
  process.exit(1);
}
