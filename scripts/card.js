// card.js — MCP 카드 렌더 라이브러리
//
// 취지:
// - MCP 객체 1개 → HTML Element 1개. 모든 카드는 이 함수 하나로 생성.
// - 선택 필드(dashboard, api_docs, github, features)는 값이 있을 때만 요소 생성.
//   공백·N/A·placeholder 표시 절대 금지 (설계도 "빈 필드 요소 미생성" 원칙).
// - 코드블록이 없는 탭은 탭 자체 미생성 — mcp.json content에 섹션이 없거나
//   ```json 블록이 비어있으면 해당 클라이언트 탭은 제외.

/**
 * @param {Object} mcp - mcp.json의 MCP 객체
 * @returns {HTMLElement} 카드 엘리먼트
 */
function renderCard(mcp) {
  const card = document.createElement('article');
  card.className = 'mcp-card';
  card.dataset.name = mcp.name;
  card.dataset.category = mcp.category || '';
  card.dataset.features = (mcp.features || []).join(',');

  card.appendChild(renderBadges(mcp));
  card.appendChild(renderTitle(mcp));
  card.appendChild(renderDesc(mcp));

  const links = renderLinks(mcp);
  if (links) card.appendChild(links);

  const features = renderFeatures(mcp);
  if (features) card.appendChild(features);

  const accordion = renderAccordion(mcp, card);
  if (accordion.toggle) card.appendChild(accordion.toggle);
  if (accordion.body) card.appendChild(accordion.body);

  return card;
}

// ── Badges ───────────────────────────────────────

function renderBadges(mcp) {
  const wrap = document.createElement('div');
  wrap.className = 'card-badges';

  if (mcp.category) {
    wrap.appendChild(badge('badge badge-category', mcp.category));
  }

  if (mcp.api_key) {
    const { cls, label } = apiKeyBadge(mcp.api_key);
    wrap.appendChild(badge(cls, label));
  }

  if (mcp.operation_type) {
    wrap.appendChild(badge('badge badge-op', mcp.operation_type));
  }

  if (mcp.status) {
    const cls = `badge badge-status-${mcp.status}`;
    wrap.appendChild(badge(cls, statusLabel(mcp.status)));
  }

  return wrap;
}

function badge(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

function apiKeyBadge(value) {
  if (value === 'required') return { cls: 'badge badge-api-required', label: '유료/키필요' };
  if (value === 'optional') return { cls: 'badge badge-api-optional', label: '키선택' };
  return { cls: 'badge badge-api-none', label: '무료' };
}

function statusLabel(value) {
  if (value === 'verified') return 'verified';
  if (value === 'needs-update') return 'needs-update';
  return 'unverified';
}

// ── Title / Description ──────────────────────────

function renderTitle(mcp) {
  const h = document.createElement('h3');
  h.className = 'card-title';
  h.textContent = mcp.display_name || mcp.name;
  return h;
}

function renderDesc(mcp) {
  const p = document.createElement('p');
  p.className = 'card-desc';
  p.textContent = mcp.description || '';
  return p;
}

// ── Links ────────────────────────────────────────

function renderLinks(mcp) {
  const links = [
    { key: 'website',   label: '공식사이트' },
    { key: 'dashboard', label: '대시보드' },
    { key: 'api_docs',  label: 'API 발급' },
    { key: 'github',    label: 'GitHub' },
  ].filter(l => mcp[l.key]);

  if (!links.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'card-links';
  for (const l of links) {
    const a = document.createElement('a');
    a.className = 'link-btn';
    a.href = mcp[l.key];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = l.label;
    wrap.appendChild(a);
  }
  return wrap;
}

// ── Features ─────────────────────────────────────

function renderFeatures(mcp) {
  if (!mcp.features || !mcp.features.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'card-features';
  for (const f of mcp.features) {
    const tag = document.createElement('span');
    tag.className = 'feature-tag';
    tag.textContent = f;
    wrap.appendChild(tag);
  }
  return wrap;
}

// ── Accordion (Tabs + CodeBlocks) ────────────────

// supported_clients 값 → content 마크다운 섹션 헤딩 + 탭 표시명
const CLIENT_SECTION_MAP = {
  'claude-cli':     { heading: 'Claude CLI 설정',     label: 'Claude CLI' },
  'claude-desktop': { heading: 'Claude Desktop 설정', label: 'Claude Desktop' },
  'codex':          { heading: 'Codex 설정',          label: 'Codex' },
  'gemini-cli':     { heading: 'Gemini CLI 설정',     label: 'Gemini CLI' },
};

function renderAccordion(mcp, card) {
  const clients = mcp.supported_clients || [];
  const content = mcp.content || '';
  const tabs = [];

  for (const client of clients) {
    const map = CLIENT_SECTION_MAP[client];
    if (!map) {
      // 매핑 없는 클라이언트 — 섹션 헤딩 규칙 모르므로 건너뜀.
      // content에 해당 섹션이 있으면 그대로 쓰고 싶지만, 명세에 없는 클라이언트는
      // 탭 자체를 생성하지 않는 쪽이 "빈 필드 요소 미생성" 원칙에 부합.
      continue;
    }
    const code = extractFirstJsonBlock(content, map.heading);
    if (!code) continue; // 코드블록 없으면 탭 미생성
    tabs.push({ id: client, label: map.label, code });
  }

  if (!tabs.length) return { toggle: null, body: null };

  const toggle = document.createElement('button');
  toggle.className = 'accordion-toggle';
  toggle.type = 'button';
  toggle.innerHTML = '설정 코드 <span class="arrow">▼</span>';

  const body = document.createElement('div');
  body.className = 'accordion-body';

  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'tabs';

  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  const tabContents = [];

  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.type = 'button';
    btn.textContent = t.label;
    btn.dataset.tabId = t.id;
    tabBar.appendChild(btn);

    const content = document.createElement('div');
    content.className = 'tab-content' + (i === 0 ? ' active' : '');
    content.dataset.tabId = t.id;

    const codeWrap = document.createElement('div');
    codeWrap.className = 'code-wrap';

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.className = 'language-json';
    codeEl.textContent = t.code;
    pre.appendChild(codeEl);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = '복사';
    copyBtn.addEventListener('click', () => copyToClipboard(t.code, copyBtn));

    codeWrap.appendChild(pre);
    codeWrap.appendChild(copyBtn);
    content.appendChild(codeWrap);

    tabsWrap.appendChild(content);
    tabContents.push({ btn, content });
  });

  tabsWrap.prepend(tabBar);

  // 탭 전환
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const id = btn.dataset.tabId;
    for (const { btn: b, content: c } of tabContents) {
      const active = b.dataset.tabId === id;
      b.classList.toggle('active', active);
      c.classList.toggle('active', active);
    }
  });

  body.appendChild(tabsWrap);

  // 아코디언 exclusive 토글
  toggle.addEventListener('click', () => {
    const willOpen = !card.classList.contains('open');
    if (willOpen) {
      document.querySelectorAll('.mcp-card.open').forEach(c => {
        if (c !== card) c.classList.remove('open');
      });
    }
    card.classList.toggle('open', willOpen);
  });

  return { toggle, body };
}

// ── content 마크다운 파서 ────────────────────────

/**
 * content 마크다운에서 특정 섹션 헤딩(`## {heading}`) 아래의
 * 첫 번째 ```json ~ ``` 코드블록 텍스트만 반환.
 * 섹션 또는 코드블록이 없으면 null.
 *
 * 취지: content는 사람이 편집한 마크다운이므로 섹션 구조는 유동적일 수 있으나,
 *       헤딩 "## {Client} 설정" 패턴은 설계도/데이터에서 고정돼 있다.
 *       다음 "## " 헤딩을 만날 때까지만 탐색하여 다른 섹션의 블록을 오염시키지 않는다.
 */
function extractFirstJsonBlock(content, heading) {
  if (!content) return null;
  // 헤딩 끝 뒤에 괄호/대시 한정자(예: " (Remote MCP)", " — 로컬 MCP") 변형 허용.
  // 취지: mcp.json에 "## Claude CLI 설정 (Remote MCP)", "## Claude CLI 설정 — 로컬 MCP"
  //       같은 변형이 실제 존재. literal 매칭 시 탭이 누락됨.
  //       첫 번째 매치만 쓰므로 같은 클라이언트의 2가지 변형이 있을 경우 상단이 채택됨.
  const suffix = '(?:\\s*[—\\-–]\\s*[^\\n]+|\\s*\\([^)]*\\))?';
  const headingRe = new RegExp(`^##\\s+${escapeRegex(heading)}${suffix}\\s*$`, 'm');
  const headingMatch = headingRe.exec(content);
  if (!headingMatch) return null;

  const start = headingMatch.index + headingMatch[0].length;
  // 다음 ## 헤딩 전까지 구간
  const rest = content.slice(start);
  const nextHeading = /\n##\s+/.exec(rest);
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;

  const blockRe = /```json\s*\n([\s\S]*?)```/;
  const blockMatch = blockRe.exec(section);
  if (!blockMatch) return null;
  return blockMatch[1].replace(/\s+$/, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Clipboard ────────────────────────────────────

function copyToClipboard(text, btn) {
  const restore = () => {
    btn.classList.remove('copied');
    btn.textContent = '복사';
  };
  const onOk = () => {
    btn.classList.add('copied');
    btn.textContent = '복사됨';
    setTimeout(restore, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onOk).catch(() => fallbackCopy(text, onOk));
  } else {
    fallbackCopy(text, onOk);
  }
}

function fallbackCopy(text, onOk) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); onOk(); } catch (_) {}
  document.body.removeChild(ta);
}

// 전역 노출
if (typeof module !== 'undefined') module.exports = { renderCard };
