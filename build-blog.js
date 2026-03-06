#!/usr/bin/env node
/**
 * build-blog.js — 自動產生 Prototype Lab 靜態 blog
 *
 * 讀取 games.json，產出:
 *   1. index.html   — 首頁產品卡列表（新→舊）
 *   2. posts/NNN-{slug}.html — 每款遊戲的 Dev Log 頁面
 *
 * 用法:
 *   node build-blog.js                  # 產出到 templates/blog/
 *   node build-blog.js --out ./dist     # 產出到自訂路徑
 *
 * Pipeline 整合: STEP 12.3 自動執行
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : __dirname;

// ─── Read game registry ───
const gamesPath = join(__dirname, 'games.json');
if (!existsSync(gamesPath)) {
    console.error('❌ games.json not found. Create it first.');
    process.exit(1);
}
const games = JSON.parse(readFileSync(gamesPath, 'utf-8'));

// ─── Ensure output dirs ───
mkdirSync(join(outDir, 'posts'), { recursive: true });

// ─── HTML helpers ───
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Index page ───
function buildIndex(games) {
    const cards = games
        .sort((a, b) => b.number - a.number)  // newest first
        .map(g => `
            <!-- Game ${String(g.number).padStart(3, '0')} -->
            <div class="game-card">
                <a class="cover-link" href="/games/${g.repo}/">
                    <img src="/games/${g.repo}/og-image.png" alt="${esc(g.name)}" loading="lazy">
                    <div class="play-overlay">
                        <div class="play-icon">▶</div>
                    </div>
                </a>
                <div class="card-body">
                    <div class="card-info">
                        <h2>#${String(g.number).padStart(3, '0')} ${esc(g.name)}</h2>
                        <p>${esc(g.tagline)}</p>
                        <div class="tags">
                            ${g.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('\n                            ')}
                        </div>
                    </div>
                    <a href="/posts/${String(g.number).padStart(3, '0')}-${g.slug}.html" class="btn-log">Log</a>
                </div>
            </div>`).join('\n');

    const newestRepo = games.sort((a, b) => b.number - a.number)[0]?.repo || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prototype Lab — by Ariescar</title>
    <meta property="og:title" content="Prototype Lab — by Ariescar">
    <meta property="og:description" content="3D browser games you can play instantly. No download.">
    <meta property="og:image" content="/games/${newestRepo}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a; color: #e0e0e0; line-height: 1.6;
            -webkit-tap-highlight-color: transparent;
        }
        .container { max-width: 480px; margin: 0 auto; padding: 1rem; }
        header { text-align: center; padding: 1.5rem 0 1rem; }
        h1 { font-size: 1.4rem; font-weight: 700; color: #fff; margin-bottom: 0.2rem; }
        .subtitle { color: #666; font-size: 0.8rem; }
        .subtitle a { color: #888; text-decoration: none; }
        .game-card {
            background: #111; border-radius: 16px; overflow: hidden;
            margin-bottom: 1.2rem; border: 1px solid #1a1a1a;
            transition: transform 0.15s, border-color 0.2s;
        }
        .game-card:hover { border-color: #333; }
        .game-card:active { transform: scale(0.98); }
        .cover-link {
            display: block; position: relative; overflow: hidden;
            aspect-ratio: 16/9; cursor: pointer;
        }
        .cover-link img {
            width: 100%; height: 100%; object-fit: cover; display: block;
            transition: transform 0.3s;
        }
        .cover-link:hover img { transform: scale(1.03); }
        .play-overlay {
            position: absolute; inset: 0;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.25); transition: background 0.2s;
        }
        .cover-link:hover .play-overlay { background: rgba(0,0,0,0.15); }
        .play-icon {
            width: 64px; height: 64px; border-radius: 50%;
            background: rgba(37, 99, 235, 0.9); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            font-size: 1.6rem; color: #fff; padding-left: 4px;
            box-shadow: 0 4px 24px rgba(37, 99, 235, 0.4);
            transition: transform 0.2s, background 0.2s;
        }
        .cover-link:hover .play-icon { transform: scale(1.1); background: rgba(59, 130, 246, 0.95); }
        .card-body {
            padding: 0.8rem 1rem 1rem;
            display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
        }
        .card-info { flex: 1; min-width: 0; }
        .card-info h2 { font-size: 1rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-info p { font-size: 0.78rem; color: #777; margin-top: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-log {
            flex-shrink: 0; padding: 0.4rem 0.8rem; border-radius: 8px;
            font-size: 0.75rem; font-weight: 600; color: #888; text-decoration: none;
            background: #1a1a1a; border: 1px solid #2a2a2a;
            transition: color 0.2s, border-color 0.2s;
        }
        .btn-log:hover { color: #ccc; border-color: #444; }
        .tags { display: flex; gap: 0.4rem; margin-top: 0.3rem; flex-wrap: wrap; }
        .tag {
            font-size: 0.65rem; padding: 0.15rem 0.5rem; border-radius: 4px;
            background: #1a1a1a; color: #666; border: 1px solid #222;
        }
        footer { text-align: center; padding: 1.5rem 0; color: #444; font-size: 0.7rem; }
        footer a { color: #666; text-decoration: none; }
        footer a:hover { color: #aaa; }
        @media (min-width: 600px) {
            .container { max-width: 560px; padding: 1.5rem; }
            .play-icon { width: 72px; height: 72px; font-size: 1.8rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Prototype Lab</h1>
            <p class="subtitle">3D browser games — play instantly · by <a href="https://linktr.ee/ariescar0326">Ariescar</a></p>
        </header>

        <main>${cards}
        </main>

        <footer>
            <p><a href="https://x.com/AriescarTu">@AriescarTu</a> · <a href="https://linktr.ee/ariescar0326">linktr.ee</a></p>
        </footer>
    </div>
</body>
</html>`;
}

// ─── Individual post page ───
function buildPost(g) {
    const num = String(g.number).padStart(3, '0');
    const features = (g.features || []).map(f => `                <li>${esc(f)}</li>`).join('\n');
    const devSections = (g.devLog || []).map(s => `
            <h3>${esc(s.title)}</h3>
            <p>${esc(s.body)}</p>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dev Log — #${num} ${esc(g.name)} | Prototype Lab</title>
    <meta property="og:title" content="${esc(g.name)} — ${esc(g.ogTagline || g.tagline)}">
    <meta property="og:description" content="${esc(g.description)}">
    <meta property="og:image" content="/games/${g.repo}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a; color: #e0e0e0; line-height: 1.8;
        }
        .container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
        a { color: #2563eb; text-decoration: none; }
        a:hover { color: #3b82f6; }
        nav { margin-bottom: 2rem; font-size: 0.85rem; }
        nav a { color: #888; }
        .hero-cover {
            width: 100%; aspect-ratio: 1200/630; object-fit: cover;
            border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid #222;
        }
        .hero { margin-bottom: 2.5rem; }
        .hero h1 { font-size: 1.6rem; color: #fff; margin-bottom: 0.5rem; }
        .hero .tagline { color: #aaa; font-size: 1rem; margin-bottom: 0.8rem; }
        .hero ul { color: #999; font-size: 0.88rem; list-style: none; padding: 0; margin-bottom: 1.2rem; }
        .hero ul li::before { content: "· "; color: #555; }
        .hero ul li { margin-bottom: 0.15rem; }
        .play-btn {
            display: inline-block; padding: 0.7rem 2rem; background: #2563eb; color: #fff;
            border-radius: 8px; font-weight: 600; font-size: 1rem;
            transition: transform 0.15s;
        }
        .play-btn:hover { background: #3b82f6; color: #fff; }
        .play-btn:active { transform: scale(0.96); }
        .game-embed {
            margin: 2rem auto; border-radius: 12px; overflow: hidden;
            border: 1px solid #222; background: #000;
            max-width: 390px;
        }
        .game-embed iframe {
            width: 100%; aspect-ratio: 9/16; border: none; display: block;
        }
        .game-embed-note {
            text-align: center; padding: 0.6rem; background: #111;
            font-size: 0.75rem; color: #555;
        }
        article { margin-top: 2rem; }
        article h2 { font-size: 1.3rem; color: #fff; margin: 2rem 0 0.8rem; }
        article h3 { font-size: 1.05rem; color: #ddd; margin: 1.5rem 0 0.5rem; }
        article p { color: #bbb; margin-bottom: 1rem; }
        article strong { color: #fff; }
        article ul { color: #bbb; padding-left: 1.5rem; margin-bottom: 1rem; }
        article li { margin-bottom: 0.3rem; }
        article hr { border: none; border-top: 1px solid #222; margin: 2rem 0; }
        footer { border-top: 1px solid #222; padding-top: 2rem; margin-top: 3rem; color: #555; font-size: 0.8rem; text-align: center; }
        @media (max-width: 480px) {
            .container { padding: 1.2rem 1rem; }
            .hero h1 { font-size: 1.3rem; }
            .game-embed { max-width: none; }
            .game-embed iframe { aspect-ratio: 9/16; max-height: 85vh; }
        }
    </style>
</head>
<body>
    <div class="container">
        <nav><a href="/">← Prototype Lab</a></nav>

        <img class="hero-cover" src="/games/${g.repo}/og-image.png" alt="${esc(g.name)} gameplay">

        <div class="hero">
            <h1>Dev Log — #${num} ${esc(g.name)}</h1>
            <p class="tagline">${esc(g.description)}</p>
            <ul>
${features}
            </ul>
        </div>

        <!-- Game embed -->
        <div class="game-embed">
            <iframe src="/games/${g.repo}/" loading="lazy" allow="autoplay"></iframe>
            <div class="game-embed-note">Best on mobile — <a href="/games/${g.repo}/">Open fullscreen</a></div>
        </div>

        <article>
            <h2>Design Notes</h2>
            ${(g.designNotes || []).map(p => `<p>${esc(p)}</p>`).join('\n            ')}

            <hr>

            <h2>Dev Log</h2>
            ${devSections}

            <hr>

            <h2>Credits</h2>
            <p>3D models by <a href="https://quaternius.com/" target="_blank">@quaternius</a></p>
            <p style="margin-top: 0.5rem;">Prototype Lab series #${num} by <a href="https://x.com/AriescarTu" target="_blank">@AriescarTu</a> · <a href="https://linktr.ee/ariescar0326" target="_blank">linktr.ee/ariescar0326</a></p>

            <p style="margin-top: 1.5rem;">
                <a href="/games/${g.repo}/" class="play-btn">▶ Play ${esc(g.name)}</a>
            </p>
        </article>

        <footer>
            <p><a href="/">← Back to Prototype Lab</a></p>
            <p style="margin-top:0.5rem;">Prototype Lab series by <a href="https://x.com/AriescarTu">@AriescarTu</a></p>
        </footer>
    </div>
</body>
</html>`;
}

// ─── Generate ───
console.log(`📝 Building blog from ${games.length} games...`);

// Index
const indexHtml = buildIndex(games);
writeFileSync(join(outDir, 'index.html'), indexHtml);
console.log('  ✅ index.html');

// Posts
for (const g of games) {
    const num = String(g.number).padStart(3, '0');
    const postPath = join(outDir, 'posts', `${num}-${g.slug}.html`);
    writeFileSync(postPath, buildPost(g));
    console.log(`  ✅ posts/${num}-${g.slug}.html`);
}

console.log(`\n🎉 Done! ${games.length + 1} files written to ${outDir}`);
