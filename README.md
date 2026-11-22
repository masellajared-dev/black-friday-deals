# Doorbuster Board

A Black Friday deals board that updates itself.

Every two hours a GitHub Action runs `scripts/fetch-deals.mjs`, which reads public deal RSS feeds (Slickdeals, DealNews, 9to5Toys, Ben's Bargains), pulls out price, original price, store and category, merges in the hand-picked deals in `data/curated.json`, and writes `site/deals.json`. The workflow then publishes `site/` to GitHub Pages.

The page (`site/index.html`) is a single static file. It lets you search, filter by category, store, discount and price, sort, and star deals (stars are saved in your browser). An open page re-checks for new deals every 30 minutes.

## Run locally

```sh
node scripts/fetch-deals.mjs      # writes site/deals.json
python3 -m http.server -d site 8000
```

## Change things

- Add or remove feeds: edit `FEEDS` at the top of `scripts/fetch-deals.mjs`.
- Update hand-picked deals: edit `data/curated.json` (`t` title, `s` store, `c` category, `p` price, `w` was, `d` percent for "up to" deals, `n` note, `u` direct link, `r` source index, `hot` top pick).
- Change the schedule: edit the `cron` line in `.github/workflows/update-deals.yml`.
- Run an update now: Actions tab → "Update deals and publish" → Run workflow.

If a feed is down or blocks the runner, that run skips it and the page lists it as unavailable.
