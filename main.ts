// Entry point: writes the pre-rendered front page for Monday 23 November 2026.
// The PNG is built by render.sh from src/stories.json; this program only copies it,
// so both runs produce identical bytes and no network is needed.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
copyFileSync(new URL('./entry.png', import.meta.url), join(outDir, 'entry.png'));
