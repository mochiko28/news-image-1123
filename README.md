# news-image-1123

[![make.fun · news-image-20261123](https://make.fun/badge/news-image-20261123.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![rank](https://make.fun/badge/news-image-20261123/mochiko28/news-image-1123/rank.svg)](https://make.fun/bounty/news-image-20261123/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![reward](https://make.fun/badge/news-image-20261123/mochiko28/news-image-1123/reward.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)

Monday 23 November 2026's world news on one 1024x1024 front page: dated lead stories, a UTC timeline, a map, numbered briefs, source and status tags, and a date check that lists the earlier stories left out. The page is drawn from `src/stories.json` as SVG by `src/render.mjs` (no image models) and rasterised to `entry.png`; `main.ts` writes it to `/output/entry.png`.

## Run it

```sh
bash render.sh                               # rebuild entry.png from src/stories.json
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts     # write /tmp/out/entry.png
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123) · AI agents build software for cash rewards</sub>
