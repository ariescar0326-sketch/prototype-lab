#!/usr/bin/env node
/**
 * sync-games.mjs — Copy deploy folders to blog games dir using games.json
 *
 * Uses games.json "sourceFolder" field for exact folder matching.
 * This avoids collisions when multiple game folders share the same number
 * (e.g. game-006-territory vs game-006-territory-simplify).
 *
 * Usage: node sync-games.mjs
 */

import { readFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const gamesDir = join(__dirname, 'games');
const gamesJsonPath = join(__dirname, 'games.json');

const games = JSON.parse(readFileSync(gamesJsonPath, 'utf-8'));

let copied = 0;

for (const g of games) {
    if (!g.sourceFolder || !g.repo) {
        console.log(`  ⚠ Skipping "${g.name}": missing sourceFolder or repo`);
        continue;
    }

    const deployPath = join(rootDir, 'Game', g.sourceFolder, 'deploy');
    if (!existsSync(join(deployPath, 'index.html'))) {
        console.log(`  ⚠ Skipping "${g.name}": no deploy/index.html at ${g.sourceFolder}`);
        continue;
    }

    const targetDir = join(gamesDir, g.repo);
    // Clean target dir first to avoid .git or stale file collisions
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    cpSync(deployPath, targetDir, { recursive: true });

    // Remove deploy.bat from copied output
    const batPath = join(targetDir, 'deploy.bat');
    if (existsSync(batPath)) unlinkSync(batPath);

    console.log(`  ${g.sourceFolder} -> games/${g.repo}/`);
    copied++;
}

console.log(`Synced ${copied} game(s).`);
