// 背景画像。public/img/<id>.webp|png があれば使い（tools/agy で生成）、無ければ内蔵の SVG で描く。

export type ArtId = 'title' | 'shop' | 'morning' | 'night' | 'ending_good' | 'ending_bad';

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const GRAIN = `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0"/></filter>`;
const WOOD = (id: string, base: string) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.18" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"/><feComposite in2="SourceGraphic" operator="in"/></filter><rect width="100%" height="100%" fill="${base}"/>`;

/** 夜の港町と、明かりの灯る質屋の店先 */
function titleSvg(): string {
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 337) % 1920;
    const y = (i * 151) % 520;
    return `<circle cx="${x}" cy="${y}" r="${(i % 3) * 0.6 + 0.6}" fill="#fff" opacity="${0.25 + (i % 5) * 0.12}"/>`;
  }).join('');
  const lattice = Array.from({ length: 22 }, (_, i) => `<rect x="${640 + i * 30}" y="560" width="6" height="330" fill="#1a110b"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070f"/><stop offset="0.55" stop-color="#17203a"/><stop offset="1" stop-color="#3a2a2a"/></linearGradient>
<radialGradient id="moon" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#fff6d8"/><stop offset="1" stop-color="#fff6d800"/></radialGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffb347" stop-opacity="0.75"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<radialGradient id="lan" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#ffe2a0"/><stop offset="0.6" stop-color="#e2582e"/><stop offset="1" stop-color="#7a1f12"/></radialGradient>
<linearGradient id="shopIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf7a"/><stop offset="1" stop-color="#b8642a"/></linearGradient>
${GRAIN}
</defs>
<rect width="1920" height="1080" fill="url(#sky)"/>
${stars}
<circle cx="1500" cy="210" r="140" fill="url(#moon)" opacity="0.9"/>
<circle cx="1500" cy="210" r="86" fill="#fff3cf"/>
<circle cx="1530" cy="190" r="14" fill="#e9dcb5" opacity="0.7"/><circle cx="1475" cy="240" r="9" fill="#e9dcb5" opacity="0.7"/>
<path d="M0 640 L120 600 L220 615 L300 560 L420 580 L470 540 L560 560 L560 1080 L0 1080 Z" fill="#0b0d16"/>
<path d="M1360 1080 L1360 520 L1460 480 L1560 500 L1640 450 L1760 480 L1840 430 L1920 450 L1920 1080 Z" fill="#0b0d16"/>
<rect x="1420" y="560" width="26" height="40" fill="#f2c46b" opacity="0.7"/><rect x="1700" y="540" width="22" height="34" fill="#f2c46b" opacity="0.5"/>
<rect x="150" y="690" width="24" height="36" fill="#f2c46b" opacity="0.6"/>
<ellipse cx="960" cy="720" rx="620" ry="340" fill="url(#glow)" opacity="0.45"/>
<path d="M520 480 L960 330 L1400 480 L1380 500 L540 500 Z" fill="#14100c"/>
<path d="M500 500 L1420 500 L1440 530 L480 530 Z" fill="#241a12"/>
<rect x="560" y="530" width="800" height="380" fill="#2a1d14"/>
<rect x="630" y="555" width="660" height="340" fill="url(#shopIn)" opacity="0.9"/>
${lattice}
<rect x="600" y="520" width="720" height="60" fill="#3a1e14"/>
<g fill="#5b1d1d"><rect x="640" y="580" width="150" height="150"/><rect x="800" y="580" width="150" height="150"/><rect x="960" y="580" width="150" height="150"/><rect x="1120" y="580" width="150" height="150"/></g>
<g fill="#f4e6c8" font-family="serif" font-weight="900" font-size="96" text-anchor="middle"><text x="715" y="690">質</text><text x="1195" y="690">質</text></g>
<g fill="#f4e6c8" opacity="0.9" font-family="serif" font-weight="700" font-size="44" text-anchor="middle"><text x="875" y="672">七</text><text x="1035" y="672">屋</text></g>
<rect x="540" y="905" width="840" height="20" fill="#120c08"/>
<line x1="470" y1="545" x2="470" y2="600" stroke="#111" stroke-width="4"/>
<ellipse cx="470" cy="660" rx="54" ry="70" fill="url(#lan)"/>
<rect x="440" y="584" width="60" height="10" fill="#1b120c"/><rect x="440" y="726" width="60" height="10" fill="#1b120c"/>
<text x="470" y="682" font-family="serif" font-weight="900" font-size="58" fill="#3a0d07" text-anchor="middle">質</text>
<ellipse cx="470" cy="660" rx="160" ry="160" fill="url(#glow)" opacity="0.6"/>
<rect x="0" y="925" width="1920" height="155" fill="#0d0b0a"/>
<path d="M0 925 L1920 925" stroke="#2b2017" stroke-width="3"/>
<ellipse cx="960" cy="990" rx="520" ry="40" fill="#ffb347" opacity="0.08"/>
<rect width="1920" height="1080" filter="url(#grain)"/>
</svg>`;
}

/** 店の奥（客の背後に見える陳列棚と暖簾） */
function shopSvg(): string {
  const items = [
    // 棚 1 段目：壺・置時計・カメラ
    '<path d="M150 150 Q120 190 140 230 L200 230 Q220 190 190 150 Z" fill="#5a3b2a"/>',
    '<rect x="260" y="160" width="60" height="70" rx="6" fill="#3b2a20"/><circle cx="290" cy="190" r="20" fill="#d9c9a0"/>',
    '<rect x="380" y="190" width="70" height="40" rx="4" fill="#222"/><circle cx="415" cy="210" r="14" fill="#555"/>',
    // 2 段目：ギター・着物の反物・刀掛け
    '<ellipse cx="1130" cy="330" rx="40" ry="48" fill="#6b3d1f"/><rect x="1124" y="220" width="12" height="110" fill="#3a2414"/>',
    '<rect x="1220" y="300" width="90" height="70" fill="#7b2d3a"/><rect x="1220" y="300" width="90" height="12" fill="#c9a24a"/>',
    '<rect x="1350" y="330" width="150" height="6" fill="#1b1b1b"/><rect x="1350" y="355" width="150" height="6" fill="#1b1b1b"/>',
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a1d"/><stop offset="1" stop-color="#21170f"/></linearGradient>
<radialGradient id="lamp" cx="0.5" cy="0.2" r="0.7"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.55"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
<linearGradient id="noren" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2f4a"/><stop offset="1" stop-color="#14203a"/></linearGradient>
<linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fa2c4"/><stop offset="1" stop-color="#c9b48a"/></linearGradient>
${GRAIN}
</defs>
<rect width="1600" height="600" fill="url(#wall)"/>
${Array.from({ length: 20 }, (_, i) => `<rect x="${i * 80}" y="0" width="2" height="600" fill="#00000040"/>`).join('')}
<rect x="100" y="230" width="420" height="16" fill="#1b120b"/><rect x="100" y="246" width="420" height="6" fill="#00000055"/>
<rect x="1060" y="370" width="460" height="16" fill="#1b120b"/><rect x="1060" y="386" width="460" height="6" fill="#00000055"/>
<rect x="100" y="400" width="420" height="16" fill="#1b120b"/>
<rect x="140" y="330" width="40" height="70" fill="#2f4a3a"/><rect x="200" y="350" width="80" height="50" fill="#4a3424"/><rect x="300" y="320" width="30" height="80" fill="#6b5a3a"/>
${items}
<rect x="1100" y="60" width="300" height="190" fill="#120c08"/><rect x="1112" y="72" width="276" height="166" fill="url(#win)" opacity="0.65"/>
<g stroke="#120c08" stroke-width="8"><line x1="1250" y1="72" x2="1250" y2="238"/><line x1="1112" y1="155" x2="1388" y2="155"/></g>
<path d="M600 0 L1000 0 L1000 300 Q950 320 900 300 L900 300 Q850 320 800 300 Q750 320 700 300 Q650 320 600 300 Z" fill="url(#noren)"/>
<g stroke="#0c1424" stroke-width="3"><line x1="700" y1="40" x2="700" y2="300"/><line x1="800" y1="40" x2="800" y2="300"/><line x1="900" y1="40" x2="900" y2="300"/></g>
<rect x="590" y="0" width="420" height="40" fill="#14100c"/>
<circle cx="800" cy="170" r="70" fill="none" stroke="#e8dcc0" stroke-width="6"/>
<text x="800" y="200" font-family="serif" font-weight="900" font-size="90" fill="#e8dcc0" text-anchor="middle">質</text>
<ellipse cx="800" cy="40" rx="700" ry="320" fill="url(#lamp)"/>
<line x1="380" y1="0" x2="380" y2="60" stroke="#111" stroke-width="3"/>
<path d="M350 60 L410 60 L400 95 L360 95 Z" fill="#c98a3a"/><ellipse cx="380" cy="100" rx="120" ry="60" fill="#ffcf7a" opacity="0.18"/>
<rect y="520" width="1600" height="80" fill="#00000055"/>
<rect width="1600" height="600" filter="url(#grain)"/>
</svg>`;
}

/** 朝：新聞を広げる卓 */
function morningSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
<defs>
${WOOD('w', '#5a3d27')}
<radialGradient id="sun" cx="0.85" cy="0.05" r="0.9"><stop offset="0" stop-color="#ffe9b5" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe9b5" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
${GRAIN}
</defs>
<rect width="1920" height="1080" filter="url(#w)"/>
${Array.from({ length: 9 }, (_, i) => `<rect x="0" y="${i * 125}" width="1920" height="3" fill="#00000040"/>`).join('')}
<rect width="1920" height="1080" fill="url(#sun)"/>
<g opacity="0.35" fill="#000"><path d="M1500 0 L1620 0 L1300 1080 L1180 1080 Z"/><path d="M1700 0 L1760 0 L1440 1080 L1380 1080 Z"/></g>
<circle cx="1700" cy="880" r="90" fill="#e9e2d0"/><circle cx="1700" cy="880" r="66" fill="#3a2414"/><circle cx="1700" cy="880" r="60" fill="#5b3a1e"/>
<rect x="120" y="820" width="220" height="40" rx="6" fill="#2b1d12" transform="rotate(-12 230 840)"/>
<rect width="1920" height="1080" fill="url(#vig)"/>
<rect width="1920" height="1080" filter="url(#grain)"/>
</svg>`;
}

/** 夜：帳場の机とランプ */
function nightSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
<defs>
${WOOD('w', '#2a1c12')}
<radialGradient id="lamp" cx="0.15" cy="0.12" r="0.9"><stop offset="0" stop-color="#ffb35c" stop-opacity="0.55"/><stop offset="0.5" stop-color="#ff9a3c" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>
${GRAIN}
</defs>
<rect width="1920" height="1080" filter="url(#w)"/>
<rect width="1920" height="1080" fill="url(#lamp)"/>
<g transform="translate(1620 820) rotate(-8)"><rect width="260" height="110" rx="8" fill="#3b2414"/>${Array.from({ length: 9 }, (_, i) => `<line x1="${20 + i * 28}" y1="10" x2="${20 + i * 28}" y2="100" stroke="#1a0f08" stroke-width="3"/><circle cx="${20 + i * 28}" cy="${30 + (i % 3) * 18}" r="9" fill="#7a4a24"/><circle cx="${20 + i * 28}" cy="80" r="9" fill="#7a4a24"/>`).join('')}<rect y="52" width="260" height="6" fill="#1a0f08"/></g>
<rect width="1920" height="1080" filter="url(#grain)"/>
</svg>`;
}

const FALLBACK: Record<ArtId, () => string> = {
  title: titleSvg,
  shop: shopSvg,
  morning: morningSvg,
  night: nightSvg,
  ending_good: titleSvg,
  ending_bad: titleSvg,
};

export const ART_IDS = Object.keys(FALLBACK) as ArtId[];

/** 内蔵 SVG を即座に設定し、生成画像（public/img/manifest.json に列挙）があれば差し替える */
export function loadArt(): void {
  const root = document.documentElement;
  for (const id of ART_IDS) root.style.setProperty(`--art-${id}`, svgUrl(FALLBACK[id]()));
  const base = import.meta.env.BASE_URL;
  fetch(`${base}img/manifest.json`)
    .then((r): Promise<Partial<Record<ArtId, string>>> | Partial<Record<ArtId, string>> => (r.ok ? r.json() : {}))
    .then((manifest) => {
      for (const id of ART_IDS) {
        const file = manifest[id];
        if (!file) continue;
        const img = new Image();
        img.onload = () => root.style.setProperty(`--art-${id}`, `url("${base}img/${file}")`);
        img.src = `${base}img/${file}`;
      }
    })
    .catch(() => {
      /* 生成画像なし：内蔵 SVG のまま */
    });
}
