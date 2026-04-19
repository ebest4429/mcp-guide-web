// main.js — mcp.json 로드, 사이드바 생성, 필터링, 테마 토글 (Phase 2 전면 재작성)
//
// 취지:
// - card.js는 카드 1개 렌더만 담당. 본 파일은 데이터 로드·DOM 삽입·상호작용 관리.
// - 배치 카테고리는 설계도 15개 고정. 빈 카테고리(카운트 0)도 사이드바에 표시(확장성).
//   이전 구현의 "mcp.json 등장 카테고리만 생성" 결정은 2026-04-19 설계도 재확정으로 폐기.
// - 검색 카테고리(features)는 다중선택. 선택 feature 전부를 가진 MCP만 통과(AND).
//   카테고리 필터와는 AND 결합. 이전 구현의 "feature 선택 시 카테고리 무시" 결정은 폐기.
// - 전체선택/전체해제 버튼으로 카테고리 일괄 제어.
// - status 필드 폐기 — 렌더·필터·데이터셋 어디에서도 참조하지 않음.

// 설계도 15개 고정 카테고리 (순서 유지)
const CATEGORIES = [
  'AI 추론 & 메모리',
  '검색 & 정보수집',
  '문서 & 지식관리',
  '커뮤니케이션',
  'UI & 디자인',
  '브라우저 & 자동화',
  '미디어',
  '코드 & 버전관리',
  '클라우드 & 인프라',
  '개발환경 & IDE',
  '데이터 & DB',
  '금융 & 비즈니스',
  '커머스 & 마케팅',
  '생산성 & 협업',
  'AI 도구 연동 가이드',
];

const STATE = {
  mcps: [],
  cards: [],                       // card 엘리먼트 배열 (mcps와 같은 순서)
  selectedCategories: new Set(),   // 체크된 카테고리
  selectedFeatures: new Set(),     // 선택된 feature 태그 (다중선택)
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

// ── Sidebar: 배치 카테고리 (15개 고정) ────────────

function renderCategorySidebar() {
  const host = document.getElementById('sidebar-placement');
  if (!host) return;

  // 카테고리별 MCP 수 집계 (15개 키는 사전 생성)
  const counts = new Map(CATEGORIES.map((c) => [c, 0]));
  for (const m of STATE.mcps) {
    if (counts.has(m.category)) counts.set(m.category, counts.get(m.category) + 1);
  }

  // 기존 동적 요소만 제거 (h2는 유지)
  [...host.querySelectorAll('.sidebar-actions, .sidebar-item')].forEach((el) => el.remove());

  // 전체선택 / 전체해제 버튼
  const actions = document.createElement('div');
  actions.className = 'sidebar-actions';

  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.className = 'sidebar-action-btn';
  selectAll.textContent = '전체선택';
  selectAll.addEventListener('click', () => {
    STATE.selectedCategories = new Set(CATEGORIES);
    syncCategoryCheckboxes();
    applyFilters();
  });

  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'sidebar-action-btn';
  clearAll.textContent = '전체해제';
  clearAll.addEventListener('click', () => {
    STATE.selectedCategories.clear();
    syncCategoryCheckboxes();
    applyFilters();
  });

  actions.appendChild(selectAll);
  actions.appendChild(clearAll);
  host.appendChild(actions);

  // 15개 고정 카테고리 (빈 것도 렌더 — count 0으로 흐리게)
  for (const cat of CATEGORIES) {
    const count = counts.get(cat) || 0;
    const label = document.createElement('label');
    label.className = 'sidebar-item' + (count === 0 ? ' empty' : '');
    label.dataset.category = cat;

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

function syncCategoryCheckboxes() {
  const host = document.getElementById('sidebar-placement');
  if (!host) return;
  for (const cb of host.querySelectorAll('.sidebar-item input[type="checkbox"]')) {
    cb.checked = STATE.selectedCategories.has(cb.value);
  }
}

// ── Sidebar: 검색 카테고리 (features 가상뷰, 다중선택) ──

function renderFeatureSidebar() {
  const host = document.getElementById('sidebar-search');
  if (!host) return;

  const set = new Set();
  for (const m of STATE.mcps) {
    for (const f of m.features || []) set.add(f);
  }

  [...host.querySelectorAll('.feature-tag-list')].forEach((el) => el.remove());

  const list = document.createElement('div');
  list.className = 'feature-tag-list';

  // 한글 가나다 순 정렬
  const sorted = [...set].sort((a, b) => a.localeCompare(b, 'ko'));

  for (const f of sorted) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feature-tag-btn';
    btn.textContent = f;
    btn.dataset.feature = f;
    btn.addEventListener('click', () => {
      if (STATE.selectedFeatures.has(f)) {
        STATE.selectedFeatures.delete(f);
        btn.classList.remove('active');
      } else {
        STATE.selectedFeatures.add(f);
        btn.classList.add('active');
      }
      applyFilters();
    });
    list.appendChild(btn);
  }

  host.appendChild(list);
}

// ── Filtering ────────────────────────────────────
//
// 조합 원칙 (마스터플랜/설계도 "교차 필터링" 해석):
//  - 카테고리 간: OR (체크된 카테고리 중 하나에 속하면 통과)
//  - features 간: AND (선택된 모든 feature를 MCP가 가져야 통과)
//  - 카테고리 ↔ features: AND (둘 다 적용 — 설계도 확정)
//  - 아무것도 선택 안 했으면 전부 표시.

function applyFilters() {
  const { selectedCategories, selectedFeatures, cards, mcps } = STATE;

  for (let i = 0; i < cards.length; i++) {
    const mcp = mcps[i];
    const card = cards[i];

    const catPass =
      selectedCategories.size === 0 || selectedCategories.has(mcp.category);

    let featPass = true;
    if (selectedFeatures.size > 0) {
      const mcpFeatures = new Set(mcp.features || []);
      for (const f of selectedFeatures) {
        if (!mcpFeatures.has(f)) {
          featPass = false;
          break;
        }
      }
    }

    card.hidden = !(catPass && featPass);
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
