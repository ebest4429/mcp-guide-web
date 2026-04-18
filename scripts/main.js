// main.js — mcp.json 로드, 사이드바 동적 생성, 필터링, 테마 토글
//
// 취지:
// - card.js는 카드 1개 렌더링만 담당. 본 파일은 데이터 로드·DOM 삽입·상호작용 관리.
// - 배치 카테고리는 mcp.json에 실제 등장한 것만 렌더링한다
//   (설계도는 15개 폭넓은 분류를 확정했지만, 빈 카테고리 체크박스는 UX 저해.
//    "빈 필드 요소 미생성" 원칙을 사이드바에도 동일 적용).
// - features 필터가 활성이면 카테고리 필터는 무시 — 횡단 검색 모드.

const STATE = {
  mcps: [],
  cards: [],              // card element 배열 (mcps와 같은 순서)
  selectedCategories: new Set(),
  selectedFeature: null,  // 단일 feature 태그 (재클릭 시 해제)
};

async function init() {
  restoreTheme();
  wireThemeToggle();

  const data = await loadMcps();
  STATE.mcps = data.mcps || [];

  renderAllCards();
  renderCategorySidebar();
  renderFeatureSidebar();
  applyFilters();
}

async function loadMcps() {
  try {
    const res = await fetch('data/mcp.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('mcp.json 로드 실패:', err);
    return { mcps: [] };
  }
}

// ── Cards ────────────────────────────────────────

function renderAllCards() {
  const grid = document.getElementById('card-grid');
  if (!grid) return;
  grid.innerHTML = '';
  STATE.cards = [];
  for (const mcp of STATE.mcps) {
    const card = renderCard(mcp);
    grid.appendChild(card);
    STATE.cards.push(card);
  }
}

// ── Sidebar: Categories ──────────────────────────

function renderCategorySidebar() {
  const host = document.getElementById('sidebar-placement');
  if (!host) return;

  // 등장 카테고리 집계 (삽입 순서 유지)
  const counts = new Map();
  for (const m of STATE.mcps) {
    if (!m.category) continue;
    counts.set(m.category, (counts.get(m.category) || 0) + 1);
  }

  // 기존 체크박스 영역만 초기화 (h2는 유지)
  [...host.querySelectorAll('.sidebar-item')].forEach(el => el.remove());

  for (const [cat, count] of counts) {
    const label = document.createElement('label');
    label.className = 'sidebar-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = cat;
    cb.addEventListener('change', () => {
      if (cb.checked) STATE.selectedCategories.add(cat);
      else STATE.selectedCategories.delete(cat);
      applyFilters();
    });

    const text = document.createElement('span');
    text.textContent = cat;

    const countEl = document.createElement('span');
    countEl.className = 'count';
    countEl.textContent = `(${count})`;

    label.appendChild(cb);
    label.appendChild(text);
    label.appendChild(countEl);
    host.appendChild(label);
  }
}

// ── Sidebar: Features (virtual view) ─────────────

function renderFeatureSidebar() {
  const host = document.getElementById('sidebar-search');
  if (!host) return;

  const set = new Set();
  for (const m of STATE.mcps) {
    for (const f of (m.features || [])) set.add(f);
  }

  // 기존 태그 영역만 초기화
  [...host.querySelectorAll('.feature-tag-list')].forEach(el => el.remove());

  const list = document.createElement('div');
  list.className = 'feature-tag-list';

  for (const f of set) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feature-tag-btn';
    btn.textContent = f;
    btn.dataset.feature = f;
    btn.addEventListener('click', () => {
      if (STATE.selectedFeature === f) {
        STATE.selectedFeature = null;
      } else {
        STATE.selectedFeature = f;
      }
      // 활성 상태 갱신
      for (const b of list.querySelectorAll('.feature-tag-btn')) {
        b.classList.toggle('active', b.dataset.feature === STATE.selectedFeature);
      }
      applyFilters();
    });
    list.appendChild(btn);
  }

  host.appendChild(list);
}

// ── Filtering ────────────────────────────────────

function applyFilters() {
  const { selectedFeature, selectedCategories, cards, mcps } = STATE;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const mcp = mcps[i];
    let visible;

    if (selectedFeature) {
      // feature 필터 활성 — 카테고리 필터 무시 (횡단 검색 모드)
      visible = (mcp.features || []).includes(selectedFeature);
    } else if (selectedCategories.size === 0) {
      visible = true;
    } else {
      visible = selectedCategories.has(mcp.category);
    }

    card.hidden = !visible;
  }
}

// ── Theme ────────────────────────────────────────

function restoreTheme() {
  const saved = localStorage.getItem('mcp-guide-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
}

function wireThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mcp-guide-theme', next);
  });
}

document.addEventListener('DOMContentLoaded', init);
