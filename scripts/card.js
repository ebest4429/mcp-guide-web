// card.js — MCP 카드 렌더 라이브러리 (Phase 2 전면 재작성)
//
// 취지:
// - 설계도 "카드 구조(전체 아코디언)" 준수.
//   접힘: 배지 행 + 제목 행(제목·api_key 배지·바로가기) + description + feature 태그
//   펼침: 본문 4섹션(## 소개/주요 기능/사용법/기타) + 필드 구획 + 클라이언트 탭 + 코드블록
// - MCP 객체 1개 → 카드 엘리먼트 1개. 모든 카드는 renderCard 하나로 생성.
// - 빈 필드 요소 미생성 원칙:
//     docs/dashboard/api_docs/github·feature·탭·본문 섹션은 값 있을 때만 생성.
//     공백·N/A·placeholder 렌더 금지.
// - status 필드 폐기(2026-04-19) — 참조 코드 없음.
// - operation_type / api_key 배지는 영문(한글) 병기.
// - category 배지는 YAML 값이 이미 한글이므로 그대로 표시.
// - exclusive 아코디언 — 한 카드 열면 다른 열린 카드 닫힘.

// ── 매핑 ──────────────────────────────────────────

// operation_type 영문 키 → 한글
const OP_TYPE_LABEL = {
  'information':    '단순정보제공',
  'docs':           '문서연결',
  'command':        '단방향지시',
  'collaboration':  '양방향협업',
  'generation':     '콘텐츠생성',
  'infrastructure': '인프라제어',
  'ai-assist':      'AI추론보조',
};

// api_key 영문 → 한글
const API_KEY_LABEL = {
  'required': '유료·키필요',
  'optional': '키선택',
  'none':     '무료',
};

// supported_clients 값 → content 섹션 헤딩 + 탭 라벨
// antigravity / vscode 추가 (2026-04-19 설계도 확정)
const CLIENT_SECTION_MAP = {
  'claude-cli':     { heading: 'Claude CLI 설정',     label: 'Claude CLI' },
  'claude-desktop': { heading: 'Claude Desktop 설정', label: 'Claude Desktop' },
  'codex':          { heading: 'Codex 설정',          label: 'Codex' },
  'gemini-cli':     { heading: 'Gemini CLI 설정',     label: 'Gemini CLI' },
  'antigravity':    { heading: 'antigravity 설정',    label: 'Antigravity' },
  'vscode':         { heading: 'VSCode 설정',         label: 'VSCode' },
};

// 필드 구획 정의 (순서 고정, 값 있을 때만 렌더)
// 메모 필드는 2026-04-19 폐기 — 특이사항은 본문 `## 기타`에서 설명
const FIELD_DEFS = [
  { key: 'docs',      label: '공식 문서' },
  { key: 'dashboard', label: '대시보드' },
  { key: 'api_docs',  label: 'API 발급' },
  { key: 'github',    label: 'GitHub' },
];

// 본문 섹션 정의 (순서 고정, 섹션 없으면 미생성)
const BODY_SECTION_DEFS = [
  { heading: '소개',      className: 'body-intro' },
  { heading: '주요 기능', className: 'body-features' },
  { heading: '사용법',    className: 'body-usage' },
  { heading: '기타',      className: 'body-etc' },
];

// ── 엔트리 ────────────────────────────────────────

/**
 * @param {Object} mcp - mcp.json의 MCP 객체
 * @returns {HTMLElement} 카드 엘리먼트 (article)
 */
function renderCard(mcp) {
  const card = document.createElement('article');
  card.className = 'mcp-card';
  card.dataset.name = mcp.name;
  card.dataset.category = mcp.category || '';
  card.dataset.operationType = mcp.operation_type || '';
  card.dataset.features = (mcp.features || []).join(',');

  const head = renderHead(mcp);
  card.appendChild(head);

  const body = renderBody(mcp);
  if (body) card.appendChild(body);

  // 카드 head 클릭 = 토글. 내부 링크·버튼 클릭은 무시.
  head.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .no-toggle')) return;
    toggleCard(card);
  });

  // 접근성
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', 'false');
  head.addEventListener('keydown', (e) => {
    if (e.target.closest('a, button')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleCard(card);
    }
  });

  return card;
}

function toggleCard(card) {
  const willOpen = !card.classList.contains('open');
  if (willOpen) {
    // exclusive — 다른 열린 카드 닫기
    document.querySelectorAll('.mcp-card.open').forEach((c) => {
      if (c !== card) {
        c.classList.remove('open');
        const h = c.querySelector('.card-head');
        if (h) h.setAttribute('aria-expanded', 'false');
      }
    });
  }
  card.classList.toggle('open', willOpen);
  const head = card.querySelector('.card-head');
  if (head) head.setAttribute('aria-expanded', String(willOpen));
}

// ── Head (접힘 영역) ─────────────────────────────

function renderHead(mcp) {
  const head = document.createElement('header');
  head.className = 'card-head';

  // 1) 배지 행: 카테고리 + operation_type
  const badgeRow = document.createElement('div');
  badgeRow.className = 'card-badge-row';
  if (mcp.category) {
    badgeRow.appendChild(makeBadge('badge badge-category', mcp.category));
  }
  if (mcp.operation_type) {
    const ko = OP_TYPE_LABEL[mcp.operation_type] || '';
    const text = ko ? `${mcp.operation_type} (${ko})` : mcp.operation_type;
    const cls = `badge badge-op badge-op-${mcp.operation_type}`;
    badgeRow.appendChild(makeBadge(cls, text));
  }
  if (badgeRow.children.length) head.appendChild(badgeRow);

  // 2) 제목 행: 제목 | (우측) api_key 배지 + 바로가기
  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = mcp.display_name || mcp.name;
  titleRow.appendChild(title);

  const right = document.createElement('div');
  right.className = 'card-title-right';

  if (mcp.api_key) {
    const ko = API_KEY_LABEL[mcp.api_key] || '';
    const text = ko ? `${mcp.api_key} (${ko})` : mcp.api_key;
    const cls = `badge badge-api badge-api-${mcp.api_key}`;
    right.appendChild(makeBadge(cls, text));
  }
  if (mcp.website) {
    const a = document.createElement('a');
    a.className = 'website-btn';
    a.href = mcp.website;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '바로가기 →';
    right.appendChild(a);
  }
  if (right.children.length) titleRow.appendChild(right);

  head.appendChild(titleRow);

  // 3) description
  if (mcp.description) {
    const p = document.createElement('p');
    p.className = 'card-desc';
    p.textContent = mcp.description;
    head.appendChild(p);
  }

  // 4) feature 태그
  if (mcp.features && mcp.features.length) {
    const wrap = document.createElement('div');
    wrap.className = 'card-features';
    for (const f of mcp.features) {
      const tag = document.createElement('span');
      tag.className = 'feature-tag';
      tag.textContent = f;
      wrap.appendChild(tag);
    }
    head.appendChild(wrap);
  }

  // 5) 아코디언 화살표 (접힘/펼침 시 CSS가 회전)
  const arrow = document.createElement('span');
  arrow.className = 'card-arrow';
  arrow.textContent = '▼';
  head.appendChild(arrow);

  return head;
}

function makeBadge(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

// ── Body (펼침 영역) ─────────────────────────────

function renderBody(mcp) {
  const body = document.createElement('div');
  body.className = 'card-body';

  const content = mcp.content || '';

  // 본문 4섹션 (섹션 없으면 미생성)
  for (const def of BODY_SECTION_DEFS) {
    const raw = extractSection(content, def.heading);
    if (!raw) continue;
    const sec = document.createElement('section');
    sec.className = `body-section ${def.className}`;
    const h = document.createElement('h4');
    h.className = 'body-heading';
    h.textContent = def.heading;
    sec.appendChild(h);
    renderMarkdownInto(sec, raw);
    body.appendChild(sec);
  }

  // 필드 구획
  const fields = renderFieldSections(mcp);
  if (fields) body.appendChild(fields);

  // 클라이언트 탭 + 코드블록
  const clients = renderClientTabs(mcp, content);
  if (clients) body.appendChild(clients);

  if (!body.children.length) return null;
  return body;
}

function renderFieldSections(mcp) {
  const fields = FIELD_DEFS.filter((d) => mcp[d.key]);
  if (!fields.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'card-fields';

  for (const f of fields) {
    const sec = document.createElement('section');
    sec.className = `field-section field-${f.key.replace('_', '-')}`;

    const h = document.createElement('h4');
    h.className = 'field-heading';
    h.textContent = f.label;
    sec.appendChild(h);

    const a = document.createElement('a');
    a.className = 'field-link';
    a.href = mcp[f.key];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = mcp[f.key];
    sec.appendChild(a);

    wrap.appendChild(sec);
  }
  return wrap;
}

function renderClientTabs(mcp, content) {
  const clients = mcp.supported_clients || [];
  const tabs = [];

  for (const client of clients) {
    const map = CLIENT_SECTION_MAP[client];
    if (!map) continue;
    const code = extractFirstJsonBlock(content, map.heading);
    if (!code) continue; // 코드블록 없으면 탭만 미생성 (카드는 유지)
    tabs.push({ id: client, label: map.label, code });
  }

  if (!tabs.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'card-clients';

  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  const panels = document.createElement('div');
  panels.className = 'tab-panels';

  const entries = [];

  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn no-toggle' + (i === 0 ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.tabId = t.id;
    tabBar.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (i === 0 ? ' active' : '');
    panel.dataset.tabId = t.id;

    const codeWrap = document.createElement('div');
    codeWrap.className = 'code-wrap';

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.className = 'language-json';
    codeEl.textContent = t.code;
    pre.appendChild(codeEl);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn no-toggle';
    copy.textContent = '복사';
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(t.code, copy);
    });

    codeWrap.appendChild(pre);
    codeWrap.appendChild(copy);
    panel.appendChild(codeWrap);
    panels.appendChild(panel);

    entries.push({ btn, panel });
  });

  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.tabId;
    for (const { btn: b, panel: p } of entries) {
      const active = b.dataset.tabId === id;
      b.classList.toggle('active', active);
      p.classList.toggle('active', active);
    }
  });

  wrap.appendChild(tabBar);
  wrap.appendChild(panels);
  return wrap;
}

// ── content 마크다운 파싱 ────────────────────────

/**
 * `## {heading}` 섹션 본문(다음 ## 전까지)을 반환.
 * 섹션이 없으면 null.
 * 헤딩 끝에 " (변형)" 또는 " — 변형" 형태의 꼬리 허용
 * (예: "## Claude CLI 설정 (Remote MCP)").
 */
function extractSection(content, heading) {
  if (!content) return null;
  const suffix = '(?:\\s*[—\\-–]\\s*[^\\n]+|\\s*\\([^)]*\\))?';
  const headingRe = new RegExp(`^##\\s+${escapeRegex(heading)}${suffix}\\s*$`, 'm');
  const m = headingRe.exec(content);
  if (!m) return null;

  const start = m.index + m[0].length;
  const rest = content.slice(start);
  const nextHeading = /\n##\s+/.exec(rest);
  const body = (nextHeading ? rest.slice(0, nextHeading.index) : rest).trim();
  return body || null;
}

/** 특정 섹션 내 첫 ```json 블록 */
function extractFirstJsonBlock(content, heading) {
  const section = extractSection(content, heading);
  if (!section) return null;
  const blockRe = /```json\s*\n([\s\S]*?)```/;
  const m = blockRe.exec(section);
  if (!m) return null;
  return m[1].replace(/\s+$/, '');
}

/**
 * 본문 섹션용 초간단 마크다운 → DOM:
 * - 연속된 `- ` → <ul><li>
 * - 연속된 `숫자. ` → <ol><li>
 * - 공백 줄로 분리된 나머지 → <p>
 * - ```...``` → <pre><code>
 * - 인라인 `code` → <code>
 */
function renderMarkdownInto(container, markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let buf = null;
  let inCode = false;
  let codeBuf = [];

  const flush = () => { if (buf) { blocks.push(buf); buf = null; } };

  for (const line of lines) {
    if (inCode) {
      if (/^\s*```/.test(line)) {
        blocks.push({ type: 'code', text: codeBuf.join('\n') });
        codeBuf = [];
        inCode = false;
      } else {
        codeBuf.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      inCode = true;
      continue;
    }

    const ul = /^\s*-\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (ul) {
      if (!buf || buf.type !== 'ul') { flush(); buf = { type: 'ul', items: [] }; }
      buf.items.push(ul[1]);
      continue;
    }
    if (ol) {
      if (!buf || buf.type !== 'ol') { flush(); buf = { type: 'ol', items: [] }; }
      buf.items.push(ol[1]);
      continue;
    }
    if (line.trim() === '') { flush(); continue; }

    if (!buf || buf.type !== 'p') { flush(); buf = { type: 'p', lines: [] }; }
    buf.lines.push(line);
  }
  flush();

  for (const b of blocks) {
    if (b.type === 'p') {
      const p = document.createElement('p');
      applyInline(p, b.lines.join(' '));
      container.appendChild(p);
    } else if (b.type === 'ul' || b.type === 'ol') {
      const list = document.createElement(b.type);
      for (const item of b.items) {
        const li = document.createElement('li');
        applyInline(li, item);
        list.appendChild(li);
      }
      container.appendChild(list);
    } else if (b.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = b.text;
      pre.appendChild(code);
      container.appendChild(pre);
    }
  }
}

function applyInline(el, text) {
  const re = /`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    const code = document.createElement('code');
    code.textContent = m[1];
    el.appendChild(code);
    last = m.index + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
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
