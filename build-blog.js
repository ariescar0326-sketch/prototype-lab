#!/usr/bin/env node
/**
 * build-blog.js — 自動產生 Prototype Lab 靜態 blog
 *
 * 讀取 games.json，產出:
 *   1. index.html   — 首頁產品卡列表（新→舊）
 *   2. posts/NNN-{slug}.html — 每款遊戲的 Dev Log 頁面
 *   3. sitemap.xml  — SEO sitemap（自動產生）
 *   4. llms.txt     — AI 搜索引擎索引（自動產生）
 *
 * SEO 功能（自動注入，不影響視覺）:
 *   - Schema.org JSON-LD（WebSite + VideoGame + FAQPage）
 *   - E-E-A-T 作者信號（author bio + datePublished）
 *   - Canonical URLs + meta description
 *   - Open Graph + Twitter Card
 *
 * 用法:
 *   node build-blog.js                  # 產出到 infra/blog/
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

// ─── Site config (SEO) ───
const SITE_URL = 'https://ariescar.com';
const AUTHOR = {
    name: 'Ariescar',
    url: 'https://x.com/AriescarTu',
    linktree: 'https://linktr.ee/ariescar0326',
    description: 'Indie game developer exploring AI-assisted game production. Building 3D browser games with Three.js and Vibe Coding workflows.',
};

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

// ─── Cover media helper ───
// Supports: og-image.png (static), cover.gif/cover.webp (animated), cover.mp4 (video)
// Priority: cover.mp4 > cover.webp > cover.gif > og-image.png
// games.json can specify "cover": "cover.mp4" etc. Default: og-image.png
function coverHtml(g) {
    const cover = g.cover || 'og-image.png';
    const ext = cover.split('.').pop().toLowerCase();
    if (ext === 'mp4' || ext === 'webm') {
        return `<video src="/games/${g.repo}/${cover}" autoplay loop muted playsinline loading="lazy"></video>`;
    }
    return `<img src="/games/${g.repo}/${cover}" alt="${esc(g.name)}" loading="lazy">`;
}

// ─── Schema.org JSON-LD helpers ───
function schemaWebSite(games) {
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Prototype Lab",
        "url": SITE_URL,
        "description": "3D browser games you can play instantly. Built with Three.js and AI-assisted development. No download required.",
        "author": {
            "@type": "Person",
            "name": AUTHOR.name,
            "url": AUTHOR.url,
            "description": AUTHOR.description,
            "sameAs": [AUTHOR.url, AUTHOR.linktree]
        },
        "hasPart": games.map(g => ({
            "@type": "VideoGame",
            "name": g.name,
            "url": `${SITE_URL}/games/${g.repo}/`
        }))
    });
}

function schemaVideoGame(g) {
    const num = String(g.number).padStart(3, '0');
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": ["VideoGame", "SoftwareApplication"],
        "name": g.name,
        "description": g.description,
        "url": `${SITE_URL}/games/${g.repo}/`,
        "image": `${SITE_URL}/games/${g.repo}/og-image.png`,
        "playMode": (g.tags || []).some(t => t.toLowerCase().includes('multiplayer') || t.includes('players')) ? "MultiPlayer" : "SinglePlayer",
        "gamePlatform": ["Web Browser", "Mobile Browser"],
        "applicationCategory": "Game",
        "operatingSystem": "Any",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "availability": "https://schema.org/InStock" },
        "author": { "@type": "Person", "name": AUTHOR.name, "url": AUTHOR.url },
        "datePublished": g.date || "2026-03",
        "inLanguage": "en",
        "genre": (g.tags || []).join(', ')
    });
}

function schemaFAQ(g) {
    // Convert devLog entries into FAQ format for AI search engines
    const qaItems = (g.devLog || []).filter(s => s.title && s.body).map(s => ({
        "@type": "Question",
        "name": `How does ${g.name} handle ${s.title.toLowerCase()}?`,
        "acceptedAnswer": {
            "@type": "Answer",
            "text": s.body
        }
    }));
    if (!qaItems.length) return '';
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": qaItems
    });
}

function schemaArticle(g) {
    const num = String(g.number).padStart(3, '0');
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": `Dev Log — #${num} ${g.name}`,
        "description": g.description,
        "image": `${SITE_URL}/games/${g.repo}/og-image.png`,
        "url": `${SITE_URL}/posts/${num}-${g.slug}.html`,
        "datePublished": g.date || "2026-03",
        "dateModified": new Date().toISOString().slice(0, 10),
        "author": {
            "@type": "Person",
            "name": AUTHOR.name,
            "url": AUTHOR.url,
            "description": AUTHOR.description,
            "sameAs": [AUTHOR.url, AUTHOR.linktree]
        },
        "publisher": {
            "@type": "Organization",
            "name": "Prototype Lab",
            "url": SITE_URL
        },
        "mainEntityOfPage": `${SITE_URL}/posts/${num}-${g.slug}.html`
    });
}

// ─── Index page ───
function buildIndex(games) {
    const cards = games
        .sort((a, b) => b.number - a.number)  // newest first
        .map(g => {
            const num = String(g.number).padStart(3, '0');
            return `
            <!-- Game ${num} -->
            <div class="game-card">
                <a class="cover-wrap" href="/games/${g.repo}/">
                    ${coverHtml(g)}
                    <div class="cover-overlay"></div>
                    <span class="cover-title">${esc(g.name)}</span>
                </a>
                <div class="card-actions">
                    <a href="/games/${g.repo}/" class="btn-play">▶ PLAY</a>
                    <a href="/posts/${num}-${g.slug}.html" class="btn-devlog">DevLog</a>
                </div>
            </div>`;
        }).join('\n');

    const newestRepo = games.sort((a, b) => b.number - a.number)[0]?.repo || '';
    const siteDescription = `${games.length} free 3D browser games built with AI-assisted development. Play instantly on mobile — no download required. Three.js, procedural audio, and Vibe Coding.`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prototype Lab — Free 3D Browser Games by Ariescar</title>
    <meta name="description" content="${esc(siteDescription)}">
    <link rel="canonical" href="${SITE_URL}/">
    <meta property="og:title" content="Prototype Lab — Free 3D Browser Games">
    <meta property="og:description" content="${esc(siteDescription)}">
    <meta property="og:image" content="${SITE_URL}/games/${newestRepo}/og-image.png">
    <meta property="og:url" content="${SITE_URL}/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Prototype Lab">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@AriescarTu">
    <meta name="twitter:creator" content="@AriescarTu">
    <meta name="google-site-verification" content="ZLlk78BTZ0Cq8LxSjUvbsJpfHSWkOzoBVVd9jhkDBf4" />
    <script type="application/ld+json">${schemaWebSite(games)}</script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #121220; color: #e0e0e0; line-height: 1.6;
            -webkit-tap-highlight-color: transparent;
        }
        .container { max-width: 480px; margin: 0 auto; padding: 0 0.8rem; }
        header {
            position: sticky; top: 0; z-index: 100;
            background: rgba(18, 18, 32, 0.88);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            text-align: center;
            padding: 0.8rem 0 0.7rem;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        h1 { font-size: 1.3rem; font-weight: 700; color: #fff; letter-spacing: -0.01em; margin-bottom: 0.35rem; }
        .kofi-btn {
            display: inline-flex; align-items: center; gap: 5px;
            font-size: 0.82rem; font-weight: 600; color: #fff; text-decoration: none;
            padding: 0.38rem 1rem; border-radius: 20px;
            background: #ff5e5b;
            transition: background 0.2s, transform 0.12s;
            cursor: pointer; user-select: none; border: none; white-space: nowrap;
        }
        .kofi-btn:hover { background: #e84e4b; transform: scale(1.03); }
        .kofi-btn:active { transform: scale(0.97); }
        .kofi-btn.active { background: #cc4a48; }
        .kofi-mobile { display: inline-flex; }
        .kofi-desktop { display: none; }
        .kofi-panel {
            display: none; max-height: 0; overflow: hidden;
            transition: max-height 0.4s ease, opacity 0.3s ease; opacity: 0;
        }
        .kofi-panel.open { max-height: 750px; opacity: 1; }
        .kofi-panel iframe { border: none; width: 100%; height: 712px; background: transparent; display: block; }
        @media (min-width: 768px) {
            .container { max-width: 560px; padding: 0 1.2rem; }
            .kofi-mobile { display: none; }
            .kofi-desktop { display: inline-flex; }
            .kofi-panel { display: block; }
        }
        main { padding-top: 0.8rem; }
        .game-card {
            position: relative; border-radius: 14px; overflow: hidden;
            margin-bottom: 0.8rem; background: #1a1a30;
            transition: transform 0.15s, box-shadow 0.25s;
        }
        .game-card:hover { box-shadow: 0 6px 28px rgba(99, 102, 241, 0.15); }
        .game-card:active { transform: scale(0.98); }
        .cover-wrap {
            display: block; position: relative; overflow: hidden;
            aspect-ratio: 16/9; cursor: pointer;
        }
        .cover-wrap img, .cover-wrap video {
            width: 100%; height: 100%; object-fit: cover; display: block;
            transition: transform 0.4s ease;
        }
        .game-card:hover .cover-wrap img,
        .game-card:hover .cover-wrap video { transform: scale(1.04); }
        .cover-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(to bottom, rgba(18,18,32,0) 20%, rgba(18,18,32,0.3) 50%, rgba(18,18,32,0.85) 100%);
            pointer-events: none;
        }
        .cover-title {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            font-size: 1.3rem; font-weight: 800; color: #fff;
            text-shadow: 0 2px 12px rgba(0,0,0,0.7), 0 0 40px rgba(0,0,0,0.4);
            text-align: center; letter-spacing: 0.01em; line-height: 1.2;
            pointer-events: none; z-index: 2; width: 80%;
        }
        .card-actions {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 0 0.7rem 0.6rem;
            display: flex; align-items: flex-end; justify-content: space-between; z-index: 3;
        }
        .btn-play {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 0.45rem 1.2rem; border-radius: 22px;
            font-size: 0.82rem; font-weight: 700; letter-spacing: 0.06em;
            color: #fff; text-decoration: none;
            background: linear-gradient(135deg, #22c55e, #16a34a);
            box-shadow: 0 2px 14px rgba(34,197,94,0.4);
            transition: transform 0.12s, box-shadow 0.2s; white-space: nowrap;
        }
        .btn-play:hover { transform: scale(1.06); box-shadow: 0 4px 22px rgba(34,197,94,0.55); }
        .btn-play:active { transform: scale(0.96); }
        .btn-devlog {
            padding: 0.25rem 0.55rem; border-radius: 6px;
            font-size: 0.62rem; font-weight: 600;
            color: rgba(255,255,255,0.35); text-decoration: none;
            background: rgba(0,0,0,0.35); backdrop-filter: blur(4px);
            transition: color 0.2s, background 0.2s;
        }
        .btn-devlog:hover { color: rgba(255,255,255,0.75); background: rgba(0,0,0,0.55); }
        footer {
            display: flex; justify-content: center; align-items: center;
            gap: 0.8rem; padding: 1.2rem 0 1.8rem;
        }
        .social-icon {
            display: flex; align-items: center; justify-content: center;
            width: 34px; height: 34px; border-radius: 50%;
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
            transition: background 0.2s, border-color 0.2s;
        }
        .social-icon:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); }
        .social-icon svg { width: 15px; height: 15px; fill: rgba(255,255,255,0.4); }
        .social-icon:hover svg { fill: #fff; }
        @media (min-width: 600px) {
            .cover-title { font-size: 1.5rem; }
            .btn-play { padding: 0.5rem 1.4rem; font-size: 0.88rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Prototype Lab</h1>
            <a href="https://ko-fi.com/ariescar" target="_blank" class="kofi-btn kofi-mobile">☕ Buy me a coffee</a>
            <span class="kofi-btn kofi-desktop" id="kofiToggle" onclick="toggleKofi()">☕ Buy me a coffee</span>
            <div class="kofi-panel" id="kofiPanel">
                <iframe src="https://ko-fi.com/ariescar/?hidefeed=true&widget=true&embed=true&preview=true"
                    title="Support Ariescar on Ko-fi"></iframe>
            </div>
        </header>

        <main>${cards}
        </main>

        <footer>
            <a href="https://x.com/AriescarTu" target="_blank" class="social-icon" title="X">
                <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://linktr.ee/ariescar0326" target="_blank" class="social-icon" title="Linktree">
                <svg viewBox="0 0 24 24"><path d="M7.953 15.066l-.038-4.044 4.044-.038.038 4.044zm8.13-4.044l-4.044.038.038 4.044 4.044-.038zM7.916 7.178L12 3.094l4.084 4.084-4.084 4.084zM12 20.906l-4.084-4.084 4.084-4.084 4.084 4.084z"/></svg>
            </a>
            <a href="https://ko-fi.com/ariescar" target="_blank" class="social-icon" title="Ko-fi">
                <svg viewBox="0 0 24 24"><path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.059-4.011 3.059s-.591-.583-1.189-1.195l-.021-.019c-1.193-1.193-1.339-2.383-.768-3.327.547-.904 1.664-1.34 2.629-1.34 1.157 0 2.279.687 2.768 1.397.851-.702 1.636-1.397 2.768-1.397.964 0 2.082.436 2.629 1.34.571.944.425 2.134-.768 3.327-.597.612-1.189 1.195-1.189 1.195s-2.765-1.606-4.011-3.059c-.073-.09.023-.179.073-.09z"/></svg>
            </a>
        </footer>
    </div>
    <script>
        function toggleKofi() {
            const panel = document.getElementById('kofiPanel');
            const toggle = document.getElementById('kofiToggle');
            panel.classList.toggle('open');
            toggle.classList.toggle('active');
        }
    </script>
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

    const postUrl = `${SITE_URL}/posts/${num}-${g.slug}.html`;
    const gameUrl = `${SITE_URL}/games/${g.repo}/`;
    const faqSchema = schemaFAQ(g);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(g.name)} Dev Log — AI Game Development | Prototype Lab</title>
    <meta name="description" content="${esc(g.description)} Dev log covering design decisions, technical challenges, and AI-assisted development process.">
    <link rel="canonical" href="${postUrl}">
    <meta property="og:title" content="${esc(g.name)} — ${esc(g.ogTagline || g.tagline)}">
    <meta property="og:description" content="${esc(g.description)}">
    <meta property="og:image" content="${SITE_URL}/games/${g.repo}/og-image.png">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Prototype Lab">
    <meta property="article:author" content="${AUTHOR.url}">
    <meta property="article:published_time" content="${g.date || '2026-03'}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@AriescarTu">
    <meta name="twitter:creator" content="@AriescarTu">
    <meta name="google-site-verification" content="ZLlk78BTZ0Cq8LxSjUvbsJpfHSWkOzoBVVd9jhkDBf4" />
    <script type="application/ld+json">${schemaVideoGame(g)}</script>
    <script type="application/ld+json">${schemaArticle(g)}</script>
    ${faqSchema ? `<script type="application/ld+json">${faqSchema}</script>` : ''}
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
        .play-cover {
            display: block; position: relative; margin: 2rem auto;
            border-radius: 12px; overflow: hidden; border: 1px solid #222;
        }
        .play-cover img {
            width: 100%; display: block;
        }
        .play-cover-overlay {
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.35); transition: background 0.2s;
        }
        .play-cover:hover .play-cover-overlay { background: rgba(0,0,0,0.15); }
        .play-cover-overlay span {
            font-size: 1.4rem; font-weight: 700; color: #fff;
            background: rgba(34,197,94,0.9); padding: 0.6rem 2rem; border-radius: 30px;
            box-shadow: 0 4px 20px rgba(34,197,94,0.4);
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

        <!-- Play link with cover -->
        <a href="/games/${g.repo}/" class="play-cover">
            <img src="/games/${g.repo}/og-image.png" alt="${esc(g.name)} gameplay" loading="lazy">
            <div class="play-cover-overlay"><span>▶ PLAY</span></div>
        </a>

        <article>
            <h2>Design Notes</h2>
            ${(g.designNotes || []).map(p => `<p>${esc(p)}</p>`).join('\n            ')}

            <hr>

            <h2>Dev Log</h2>
            ${devSections}

            <hr>

            ${(g.credits && g.credits.length) ? `<h2>Credits</h2>
            ${g.credits.map(c => `<p>${esc(c.role)} by <a href="${c.url}" target="_blank" rel="noopener">${esc(c.name)}</a></p>`).join('\n            ')}` : ''}

            <p style="margin-top: 1.5rem;">
                <a href="${gameUrl}" class="play-btn">▶ Play ${esc(g.name)}</a>
            </p>

            <hr>

            <!-- E-E-A-T Author Bio -->
            <div class="author-bio" style="display:flex;gap:1rem;align-items:flex-start;padding:1.2rem;background:#111;border-radius:10px;margin-top:1rem;">
                <div>
                    <p style="color:#fff;font-weight:600;margin-bottom:0.3rem;">Built by ${AUTHOR.name}</p>
                    <p style="color:#999;font-size:0.85rem;margin-bottom:0.5rem;">${esc(AUTHOR.description)}</p>
                    <p style="font-size:0.8rem;">
                        <a href="${AUTHOR.url}" target="_blank" rel="noopener">X / Twitter</a>
                        · <a href="${AUTHOR.linktree}" target="_blank" rel="noopener">All Links</a>
                        · <a href="/">More Games</a>
                    </p>
                </div>
            </div>
        </article>

        <footer>
            <p><a href="/">← Back to Prototype Lab</a></p>
            <p style="margin-top:0.5rem;">Prototype Lab #${num} · ${g.date || '2026'} · <a href="${AUTHOR.url}">@AriescarTu</a></p>
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

// ─── Sitemap.xml ───
function buildSitemap(games) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
        `  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`
    ];
    for (const g of games) {
        const num = String(g.number).padStart(3, '0');
        urls.push(`  <url><loc>${SITE_URL}/posts/${num}-${g.slug}.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
        urls.push(`  <url><loc>${SITE_URL}/games/${g.repo}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
    }
    // Tag collection pages
    const seenTags = new Set();
    for (const g of games) {
        for (const tag of (g.tags || [])) {
            const key = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
            if (!seenTags.has(key)) {
                seenTags.add(key);
                urls.push(`  <url><loc>${SITE_URL}/tags/${key}.html</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
            }
        }
    }
    urls.push(`  <url><loc>${SITE_URL}/tags/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

const sitemapXml = buildSitemap(games);
writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml);
console.log('  ✅ sitemap.xml');

// ─── llms.txt (auto-generated from games.json) ───
function buildLlmsTxt(games) {
    const gameList = games.sort((a, b) => b.number - a.number).map(g => {
        const num = String(g.number).padStart(3, '0');
        return `- [${g.name}](${SITE_URL}/games/${g.repo}/): ${g.description}`;
    }).join('\n');
    const devLogList = games.sort((a, b) => b.number - a.number).map(g => {
        const num = String(g.number).padStart(3, '0');
        const topics = (g.devLog || []).map(s => s.title).join(', ');
        return `- [${g.name} Dev Log](${SITE_URL}/posts/${num}-${g.slug}.html): ${topics || 'Design and development notes'}.`;
    }).join('\n');

    return `# Prototype Lab

> A series of ${games.length} free 3D browser games built with AI-assisted development (Vibe Coding). Each game is a single HTML file powered by Three.js, playable instantly on mobile with no download. Created by ${AUTHOR.name} — an indie developer exploring AI-driven game production pipelines.

## About

Prototype Lab is an ongoing experiment in rapid game prototyping using AI tools (Claude, Cursor) combined with Three.js for 3D rendering. The project explores how a solo developer can ship playable browser games in hours instead of weeks using Vibe Coding workflows.

Key technical features across all games:
- Single-file HTML architecture (no build step, no bundler)
- Three.js CDN with ES module import maps
- GLTF 3D models with skeletal animation
- Procedural audio via Web Audio API (zero audio files)
- Mobile-first 9:16 portrait design
- Real-time multiplayer support

## Games

${gameList}

## Dev Logs

${devLogList}

## Technical Stack

- Rendering: Three.js (CDN, ES modules)
- 3D Assets: GLTF models (credits vary per game)
- Audio: Web Audio API procedural synthesis
- Hosting: Netlify (blog + games)
- Development: AI-assisted (Vibe Coding), single-file HTML pattern

## Contact

- Author: ${AUTHOR.name} (@AriescarTu on X)
- Links: ${AUTHOR.linktree}
- Support: https://ko-fi.com/ariescar
`;
}

const llmsTxt = buildLlmsTxt(games);
writeFileSync(join(outDir, 'llms.txt'), llmsTxt);
console.log('  ✅ llms.txt');

// ─── Tag collection pages (LLM SEO: answers "recommend me a X game") ───
function buildTagPages(games) {
    const tagMap = {};
    for (const g of games) {
        for (const tag of (g.tags || [])) {
            const key = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
            if (!tagMap[key]) tagMap[key] = { label: tag, games: [] };
            tagMap[key].games.push(g);
        }
    }

    mkdirSync(join(outDir, 'tags'), { recursive: true });
    const tagIndex = [];
    let count = 0;

    for (const [slug, { label, games: tagged }] of Object.entries(tagMap)) {
        if (tagged.length < 1) continue;
        tagIndex.push({ slug, label, count: tagged.length });

        const cards = tagged.sort((a, b) => b.number - a.number).map(g => {
            const num = String(g.number).padStart(3, '0');
            return `<li><a href="/games/${g.repo}/">▶ ${esc(g.name)}</a> — ${esc(g.tagline)}</li>`;
        }).join('\n            ');

        const pageUrl = `${SITE_URL}/tags/${slug}.html`;
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(label)} Games — Free 3D Browser Games | Prototype Lab</title>
    <meta name="description" content="${tagged.length} free ${esc(label.toLowerCase())} browser games you can play instantly. No download required.">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:title" content="${esc(label)} Games — Prototype Lab">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:type" content="website">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.8; }
        .container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
        a { color: #2563eb; text-decoration: none; } a:hover { color: #3b82f6; }
        nav { margin-bottom: 2rem; font-size: 0.85rem; } nav a { color: #888; }
        h1 { font-size: 1.5rem; color: #fff; margin-bottom: 1rem; }
        ul { list-style: none; padding: 0; } li { margin-bottom: 0.8rem; font-size: 1rem; }
        li a { font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <nav><a href="/">← Prototype Lab</a> · <a href="/tags/">All Tags</a></nav>
        <h1>${esc(label)} Games (${tagged.length})</h1>
        <ul>
            ${cards}
        </ul>
    </div>
</body>
</html>`;
        writeFileSync(join(outDir, 'tags', `${slug}.html`), html);
        count++;
    }

    // Tag index page
    const indexCards = tagIndex.sort((a, b) => b.count - a.count)
        .map(t => `<li><a href="/tags/${t.slug}.html">${esc(t.label)}</a> (${t.count})</li>`)
        .join('\n            ');
    const tagIndexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browse by Tag — Free 3D Browser Games | Prototype Lab</title>
    <meta name="description" content="Browse ${games.length} free 3D browser games by category. ${tagIndex.map(t => t.label).join(', ')}.">
    <link rel="canonical" href="${SITE_URL}/tags/">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.8; }
        .container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
        a { color: #2563eb; text-decoration: none; } a:hover { color: #3b82f6; }
        nav { margin-bottom: 2rem; font-size: 0.85rem; } nav a { color: #888; }
        h1 { font-size: 1.5rem; color: #fff; margin-bottom: 1rem; }
        ul { list-style: none; padding: 0; } li { margin-bottom: 0.6rem; font-size: 1rem; }
    </style>
</head>
<body>
    <div class="container">
        <nav><a href="/">← Prototype Lab</a></nav>
        <h1>Browse by Tag</h1>
        <ul>
            ${indexCards}
        </ul>
    </div>
</body>
</html>`;
    writeFileSync(join(outDir, 'tags', 'index.html'), tagIndexHtml);
    return count;
}

const tagCount = buildTagPages(games);
console.log(`  ✅ ${tagCount} tag pages + tags/index.html`);

console.log(`\n🎉 Done! ${games.length + tagCount + 4} files written to ${outDir}`);
