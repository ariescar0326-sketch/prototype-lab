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

// ─── Separate games by deployMode ───
function splitByMode(games) {
    const shipped = games.filter(g => g.deployMode === 'premium');
    const prototype = games.filter(g => g.deployMode === 'base');
    // Legacy: games without deployMode go to shipped (they were manually added before deploy.js)
    const legacy = games.filter(g => !g.deployMode);
    return { shipped: [...shipped, ...legacy], prototype };
}

// ─── Index page (Shipped — white theme, card flow) ───
function buildIndex(games) {
    const { shipped } = splitByMode(games);
    const display = shipped.sort((a, b) => b.number - a.number);

    const cards = display.map(g => {
        const num = String(g.number).padStart(3, '0');
        const orientBadge = g.orientation === 'landscape' ? 'PC' : 'M';
        return `
            <div class="game-card">
                <a class="cover-wrap" href="/games/${g.repo}/">
                    ${coverHtml(g)}
                    <div class="cover-overlay"></div>
                    <span class="cover-title">${esc(g.name)}</span>
                    <span class="orient-badge">${orientBadge}</span>
                </a>
                <div class="card-actions">
                    <a href="/games/${g.repo}/" class="btn-play">&#9654; PLAY</a>
                    <a href="/posts/${num}-${g.slug}.html" class="btn-devlog">DevLog</a>
                </div>
            </div>`;
    }).join('\n');

    const newestRepo = display[0]?.repo || '';
    const siteDescription = `${games.length} free browser games built with AI-assisted development. Play instantly — no download required.`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prototype Lab — Free Browser Games by Ariescar</title>
    <meta name="description" content="${esc(siteDescription)}">
    <link rel="canonical" href="${SITE_URL}/">
    <meta property="og:title" content="Prototype Lab — Free Browser Games">
    <meta property="og:description" content="${esc(siteDescription)}">
    <meta property="og:image" content="${SITE_URL}/games/${newestRepo}/og-image.png">
    <meta property="og:url" content="${SITE_URL}/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Prototype Lab">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@AriescarTu">
    <meta name="twitter:creator" content="@AriescarTu">
    <meta name="google-site-verification" content="XxItPiajCa76RAenxbryUBamHCfuciBdJnOQaa4oVwI" />
    <script type="application/ld+json">${schemaWebSite(games)}</script>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg:#FAFAF8;--card-bg:#FFF;--text:#1A1A1A;--text2:#6B6B6B;--text3:#9E9E9E;--border:#EBEBEB;--accent:#2A2A2A;--radius:14px;--t:0.2s cubic-bezier(.25,.46,.45,.94)}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
        .container{max-width:560px;margin:0 auto;padding:0 20px}
        header{padding:32px 0 0;text-align:center}
        .logo{font-size:1.1rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
        .header-links{margin-top:10px;display:flex;justify-content:center;gap:16px;align-items:center}
        .header-links a,.kofi-toggle{font-size:.78rem;color:var(--text2);text-decoration:none;transition:color var(--t);cursor:pointer;user-select:none}
        .header-links a:hover,.kofi-toggle:hover{color:var(--text)}
        .kofi-toggle.active{color:var(--text);font-weight:600}
        .dot-sep{width:3px;height:3px;border-radius:50%;background:var(--text3)}
        .kofi-panel{max-height:0;overflow:hidden;transition:max-height .4s ease,opacity .3s ease;opacity:0;margin-top:0}
        .kofi-panel.open{max-height:720px;opacity:1;margin-top:12px}
        .kofi-panel iframe{border:none;width:100%;height:712px;background:transparent;display:block;border-radius:var(--radius)}
        .subscribe-section{margin:24px auto 0;max-width:480px;background:#F5F4F0;border:1px solid #E5E3DC;border-radius:var(--radius);padding:18px 22px;text-align:center}
        .subscribe-title{font-size:.95rem;margin-bottom:3px}
        .subscribe-title strong{font-weight:700;letter-spacing:.02em}
        .subscribe-desc{font-size:.8rem;color:var(--text2);margin-bottom:11px;line-height:1.55}
        .subscribe-form{display:flex;gap:8px;max-width:360px;margin:0 auto}
        .subscribe-form input[type=email]{flex:1;padding:9px 14px;border:1px solid var(--border);border-radius:8px;font-size:.82rem;background:#fff;color:var(--text);outline:none}
        .subscribe-form input:focus{border-color:var(--accent)}
        .subscribe-form button{padding:9px 18px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;transition:background var(--t);white-space:nowrap}
        .subscribe-form button:hover{background:#444}
        .nav-tabs{display:flex;gap:24px;margin-top:24px;border-bottom:1px solid var(--border)}
        .nav-tab{font-size:.82rem;font-weight:500;color:var(--text3);text-decoration:none;padding-bottom:10px;border-bottom:2px solid transparent;transition:color var(--t),border-color var(--t)}
        .nav-tab:hover{color:var(--text2)}
        .nav-tab.active{color:var(--text);font-weight:600;border-bottom-color:var(--text)}
        main{padding-top:14px}
        .game-card{position:relative;border-radius:var(--radius);overflow:hidden;margin-bottom:14px;background:var(--card-bg);border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.04);transition:transform .15s,box-shadow .25s}
        .game-card:hover{box-shadow:0 8px 24px rgba(0,0,0,.08)}
        .game-card:active{transform:scale(.99)}
        .cover-wrap{display:block;position:relative;overflow:hidden;aspect-ratio:16/9;cursor:pointer}
        .cover-wrap img,.cover-wrap video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
        .game-card:hover .cover-wrap img,.game-card:hover .cover-wrap video{transform:scale(1.04)}
        .cover-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(26,26,26,0) 20%,rgba(26,26,26,.25) 50%,rgba(26,26,26,.8) 100%);pointer-events:none}
        .cover-title{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1.3rem;font-weight:800;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.6);text-align:center;line-height:1.2;pointer-events:none;z-index:2;width:80%}
        .orient-badge{position:absolute;top:10px;right:10px;font-size:.6rem;font-weight:600;color:rgba(255,255,255,.7);background:rgba(0,0,0,.3);padding:2px 7px;border-radius:8px;backdrop-filter:blur(4px);z-index:3}
        .card-actions{position:absolute;bottom:0;left:0;right:0;padding:0 14px 12px;display:flex;align-items:flex-end;justify-content:space-between;z-index:3}
        .btn-play{display:inline-flex;align-items:center;gap:5px;padding:8px 20px;border-radius:22px;font-size:.82rem;font-weight:700;letter-spacing:.06em;color:#fff;text-decoration:none;background:var(--accent);box-shadow:0 2px 12px rgba(0,0,0,.25);transition:transform .12s,box-shadow .2s;white-space:nowrap}
        .btn-play:hover{transform:scale(1.06);box-shadow:0 4px 20px rgba(0,0,0,.35)}
        .btn-play:active{transform:scale(.96)}
        .btn-devlog{padding:4px 10px;border-radius:6px;font-size:.65rem;font-weight:600;color:rgba(255,255,255,.4);text-decoration:none;background:rgba(0,0,0,.3);backdrop-filter:blur(4px);transition:color .2s,background .2s}
        .btn-devlog:hover{color:rgba(255,255,255,.8);background:rgba(0,0,0,.5)}
        footer{text-align:center;padding:24px 0 40px;border-top:1px solid var(--border);margin-top:16px}
        .footer-links{display:flex;justify-content:center;gap:20px}
        .footer-links a{font-size:.75rem;color:var(--text3);text-decoration:none;transition:color var(--t)}
        .footer-links a:hover{color:var(--text)}
        .footer-copy{font-size:.7rem;color:var(--text3);margin-top:8px}
        @media(max-width:480px){.container{padding:0 14px}header{padding:24px 0 0}.subscribe-section{padding:14px 16px;margin-top:18px}.subscribe-form{flex-direction:column}.subscribe-form button{width:100%}.cover-title{font-size:1.1rem}}
        @media(min-width:600px){.cover-title{font-size:1.5rem}.btn-play{padding:9px 22px;font-size:.88rem}}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">Prototype Lab</div>
            <div class="header-links">
                <span class="kofi-toggle" id="kofiToggle" onclick="toggleKofi()">Buy me a coffee</span>
                <div class="dot-sep"></div>
                <a href="https://x.com/AriescarTu" target="_blank">X / Twitter</a>
                <div class="dot-sep"></div>
                <a href="https://linktr.ee/ariescar0326" target="_blank">Info</a>
            </div>
            <div class="kofi-panel" id="kofiPanel">
                <iframe src="https://ko-fi.com/ariescar/?hidefeed=true&widget=true&embed=true&preview=true"
                    title="Support Ariescar on Ko-fi"></iframe>
            </div>
        </header>

        <div class="subscribe-section">
            <p class="subscribe-title"><strong>Kill / Ship Weekly</strong></p>
            <p class="subscribe-desc">A weekly breakdown of game mechanics.<br>Which prototypes survive, which get cut, and why.</p>
            <form class="subscribe-form" onsubmit="handleSubscribe(event)">
                <input type="email" placeholder="your@email.com" required>
                <button type="submit">Subscribe</button>
            </form>
        </div>

        <nav class="nav-tabs">
            <a href="/prototype.html" class="nav-tab">Prototype</a>
            <a href="/" class="nav-tab active">Shipped</a>
        </nav>

        <main>${cards}
        </main>

        <footer>
            <div class="footer-links">
                <a href="https://ko-fi.com/ariescar" target="_blank">Ko-fi</a>
                <a href="https://x.com/AriescarTu" target="_blank">X</a>
                <a href="https://linktr.ee/ariescar0326" target="_blank">Linktree</a>
            </div>
            <p class="footer-copy">Prototype Lab &mdash; Ariescar</p>
        </footer>
    </div>
    <script>
        function toggleKofi(){const p=document.getElementById('kofiPanel'),t=document.getElementById('kofiToggle');p.classList.toggle('open');t.classList.toggle('active')}
        function handleSubscribe(e){e.preventDefault();const i=e.target.querySelector('input'),b=e.target.querySelector('button');b.textContent='Subscribed!';b.style.background='#4CAF50';i.value='';setTimeout(()=>{b.textContent='Subscribe';b.style.background=''},2000)}
    </script>
</body>
</html>`;
}

// ─── Prototype Gallery page (grid, infinite scroll, random) ───
function buildPrototypePage(games) {
    const { prototype, shipped } = splitByMode(games);
    // Include all games in the prototype gallery (both base and premium)
    const allForGallery = [...prototype, ...shipped].sort((a, b) => b.number - a.number);

    const gamesJson = JSON.stringify(allForGallery.map(g => ({
        name: g.name,
        slug: g.repo,
        orientation: g.orientation || 'portrait',
        hasImage: existsSync(join(__dirname, 'games', g.repo, 'og-image.png')),
        url: `/games/${g.repo}/`
    })));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prototype Gallery — All Games | Prototype Lab</title>
    <meta name="description" content="Browse all ${allForGallery.length} prototype browser games. Click to play instantly.">
    <link rel="canonical" href="${SITE_URL}/prototype.html">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg:#FAFAF8;--card-bg:#FFF;--text:#1A1A1A;--text2:#6B6B6B;--text3:#9E9E9E;--border:#EBEBEB;--accent:#2A2A2A;--radius:12px;--gap:14px;--card-min:156px;--t:0.2s cubic-bezier(.25,.46,.45,.94)}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased}
        .container{max-width:1200px;margin:0 auto;padding:0 20px}
        header{padding:32px 0 0;text-align:center}
        .logo{font-size:1.1rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
        .header-links{margin-top:10px;display:flex;justify-content:center;gap:16px;align-items:center}
        .header-links a,.kofi-toggle{font-size:.78rem;color:var(--text2);text-decoration:none;transition:color var(--t);cursor:pointer;user-select:none}
        .header-links a:hover,.kofi-toggle:hover{color:var(--text)}
        .kofi-toggle.active{color:var(--text);font-weight:600}
        .dot-sep{width:3px;height:3px;border-radius:50%;background:var(--text3)}
        .kofi-panel{max-height:0;overflow:hidden;transition:max-height .4s ease,opacity .3s ease;opacity:0}
        .kofi-panel.open{max-height:720px;opacity:1;margin-top:12px}
        .kofi-panel iframe{border:none;width:100%;height:712px;background:transparent;display:block;border-radius:var(--radius)}
        .nav-tabs{display:flex;gap:24px;margin-top:24px;border-bottom:1px solid var(--border)}
        .nav-tab{font-size:.82rem;font-weight:500;color:var(--text3);text-decoration:none;padding-bottom:10px;border-bottom:2px solid transparent;transition:color var(--t),border-color var(--t)}
        .nav-tab:hover{color:var(--text2)}
        .nav-tab.active{color:var(--text);font-weight:600;border-bottom-color:var(--text)}
        .gallery-header{display:flex;justify-content:flex-end;margin:12px 0 14px}
        .gallery-count{font-size:.75rem;color:var(--text3)}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-min),1fr));gap:var(--gap)}
        .card{background:var(--card-bg);border-radius:var(--radius);overflow:hidden;cursor:pointer;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.04);transition:box-shadow var(--t),transform var(--t);aspect-ratio:1/1;position:relative}
        .card:hover{box-shadow:0 8px 24px rgba(0,0,0,.08);transform:translateY(-2px)}
        .card:active{transform:translateY(0) scale(.98)}
        .card img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
        .card:hover img{transform:scale(1.04)}
        .card-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;color:var(--text3);background:#F0F0EC}
        .card-label{position:absolute;bottom:0;left:0;right:0;padding:24px 12px 10px;background:linear-gradient(to top,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 100%);pointer-events:none}
        .card-label span{font-size:.78rem;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.3)}
        .card-orient{position:absolute;top:8px;right:8px;font-size:.6rem;font-weight:600;color:rgba(255,255,255,.7);background:rgba(0,0,0,.3);padding:2px 7px;border-radius:8px;backdrop-filter:blur(4px);pointer-events:none}
        .loader{text-align:center;padding:32px 0 48px;color:var(--text3);font-size:.8rem}
        .loader-dots{display:inline-flex;gap:4px;margin-top:8px}
        .loader-dots span{width:5px;height:5px;border-radius:50%;background:var(--text3);animation:pulse 1.2s infinite}
        .loader-dots span:nth-child(2){animation-delay:.2s}
        .loader-dots span:nth-child(3){animation-delay:.4s}
        @keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        .loader.done{display:none}
        .modal-overlay{display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s ease}
        .modal-overlay.open{display:flex;align-items:center;justify-content:center}
        .modal-overlay.visible{opacity:1}
        .modal-frame{position:relative;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.4);transform:scale(.95);transition:transform .25s ease}
        .modal-frame.portrait{width:92vw;height:90vh;max-width:480px;max-height:860px}
        .modal-frame.landscape{width:94vw;height:80vh;max-width:900px;max-height:600px}
        .modal-overlay.visible .modal-frame{transform:scale(1)}
        .modal-frame iframe{width:100%;height:100%;border:none;display:block}
        .modal-close{position:absolute;top:12px;right:12px;z-index:10;width:36px;height:36px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
        .modal-close:hover{background:rgba(0,0,0,.75)}
        .modal-title{position:absolute;top:12px;left:16px;z-index:10;font-size:.8rem;font-weight:600;color:#fff;background:rgba(0,0,0,.4);padding:4px 12px;border-radius:20px;backdrop-filter:blur(8px)}
        footer{text-align:center;padding:24px 0 40px;border-top:1px solid var(--border);margin-top:16px}
        .footer-links{display:flex;justify-content:center;gap:20px}
        .footer-links a{font-size:.75rem;color:var(--text3);text-decoration:none;transition:color var(--t)}
        .footer-links a:hover{color:var(--text)}
        .footer-copy{font-size:.7rem;color:var(--text3);margin-top:8px}
        @media(max-width:480px){:root{--gap:10px;--card-min:140px}.container{padding:0 14px}header{padding:24px 0 0}.modal-frame.portrait,.modal-frame.landscape{width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0}}
        @media(min-width:768px){:root{--card-min:180px;--gap:16px}}
        @media(min-width:1024px){:root{--card-min:190px}}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">Prototype Lab</div>
            <div class="header-links">
                <span class="kofi-toggle" id="kofiToggle" onclick="toggleKofi()">Buy me a coffee</span>
                <div class="dot-sep"></div>
                <a href="https://x.com/AriescarTu" target="_blank">X / Twitter</a>
                <div class="dot-sep"></div>
                <a href="https://linktr.ee/ariescar0326" target="_blank">Info</a>
            </div>
            <div class="kofi-panel" id="kofiPanel">
                <iframe src="https://ko-fi.com/ariescar/?hidefeed=true&widget=true&embed=true&preview=true"
                    title="Support Ariescar on Ko-fi"></iframe>
            </div>
        </header>

        <nav class="nav-tabs">
            <a href="/prototype.html" class="nav-tab active">Prototype</a>
            <a href="/" class="nav-tab">Shipped</a>
        </nav>

        <div class="gallery-header">
            <span class="gallery-count" id="countLabel"></span>
        </div>
        <div class="grid" id="gameGrid"></div>
        <div class="loader" id="loader"><div class="loader-dots"><span></span><span></span><span></span></div></div>

        <footer>
            <div class="footer-links">
                <a href="https://ko-fi.com/ariescar" target="_blank">Ko-fi</a>
                <a href="https://x.com/AriescarTu" target="_blank">X</a>
                <a href="https://linktr.ee/ariescar0326" target="_blank">Linktree</a>
            </div>
            <p class="footer-copy">Prototype Lab &mdash; Ariescar</p>
        </footer>
    </div>

    <div class="modal-overlay" id="gameModal">
        <div class="modal-frame portrait">
            <span class="modal-title" id="modalTitle"></span>
            <button class="modal-close" onclick="closeGame()" aria-label="Close">&times;</button>
            <iframe id="gameIframe" src="about:blank" allow="autoplay; fullscreen"></iframe>
        </div>
    </div>

    <script>
    const ALL_GAMES = ${gamesJson};
    const PAGE_SIZE = 10;
    let shuffled, loaded = 0;

    // Fisher-Yates shuffle
    function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

    shuffled = shuffle(ALL_GAMES);

    function createCard(g){
        const c=document.createElement('div');c.className='card';c.role='button';c.tabIndex=0;
        const orient=g.orientation==='landscape'?'PC':'M';
        if(g.hasImage){
            c.innerHTML='<img src="/games/'+g.slug+'/og-image.png" alt="'+g.name+'" loading="lazy"><div class="card-label"><span>'+g.name+'</span></div><span class="card-orient">'+orient+'</span>';
        }else{
            c.innerHTML='<div class="card-placeholder">'+g.name.charAt(0)+'</div><div class="card-label"><span>'+g.name+'</span></div><span class="card-orient">'+orient+'</span>';
        }
        c.onclick=()=>openGame(g);
        return c;
    }

    function loadMore(){
        const grid=document.getElementById('gameGrid');
        const end=Math.min(loaded+PAGE_SIZE,shuffled.length);
        const f=document.createDocumentFragment();
        for(let i=loaded;i<end;i++)f.appendChild(createCard(shuffled[i]));
        grid.appendChild(f);loaded=end;
        document.getElementById('countLabel').textContent=loaded+' / '+shuffled.length;
        if(loaded>=shuffled.length)document.getElementById('loader').classList.add('done');
    }

    const obs=new IntersectionObserver(e=>{if(e[0].isIntersecting&&loaded<shuffled.length)loadMore()},{rootMargin:'200px'});
    obs.observe(document.getElementById('loader'));

    function openGame(g){
        const m=document.getElementById('gameModal'),f=document.querySelector('.modal-frame'),
              iframe=document.getElementById('gameIframe'),t=document.getElementById('modalTitle');
        f.classList.remove('portrait','landscape');f.classList.add(g.orientation||'portrait');
        t.textContent=g.name;iframe.src=g.url;
        m.classList.add('open');requestAnimationFrame(()=>requestAnimationFrame(()=>m.classList.add('visible')));
        document.body.style.overflow='hidden';
    }

    function closeGame(){
        const m=document.getElementById('gameModal'),iframe=document.getElementById('gameIframe');
        m.classList.remove('visible');
        setTimeout(()=>{m.classList.remove('open');iframe.src='about:blank';document.body.style.overflow=''},250);
    }

    document.getElementById('gameModal').onclick=e=>{if(e.target.classList.contains('modal-overlay'))closeGame()};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeGame()});
    function toggleKofi(){document.getElementById('kofiPanel').classList.toggle('open');document.getElementById('kofiToggle').classList.toggle('active')}

    loadMore();
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
    <meta name="google-site-verification" content="XxItPiajCa76RAenxbryUBamHCfuciBdJnOQaa4oVwI" />
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

// Index (Shipped page)
const indexHtml = buildIndex(games);
writeFileSync(join(outDir, 'index.html'), indexHtml);
console.log('  ✅ index.html');

// Prototype Gallery page
const protoHtml = buildPrototypePage(games);
writeFileSync(join(outDir, 'prototype.html'), protoHtml);
console.log('  ✅ prototype.html');

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
        `  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
        `  <url><loc>${SITE_URL}/prototype.html</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`
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
