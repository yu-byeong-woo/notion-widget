(function () {
  'use strict';

  const STORAGE_KEY = 'notion_credit_tracker_v1';
  const GRADUATION_GOAL = 136;

  const state = {
    data: null,
    activeFilter: '전체',
    isSyncing: false,
  };

  // DOM References
  const el = {
    syncBtn: document.getElementById('sync-btn'),
    syncLabel: document.getElementById('sync-label'),
    statusBanner: document.getElementById('status-banner'),
    progressCompleted: document.getElementById('progress-completed'),
    progressGoal: document.getElementById('progress-goal'),
    progressPercent: document.getElementById('progress-percent'),
    progressInProgress: document.getElementById('progress-inprogress'),
    progressBarContainer: document.getElementById('progress-bar-container'),
    progressFill: document.getElementById('progress-fill'),
    progressFillInProgress: document.getElementById('progress-fill-inprogress'),
    statGoal: document.getElementById('stat-goal'),
    statCompleted: document.getElementById('stat-completed'),
    statRemaining: document.getElementById('stat-remaining'),
    statInProgress: document.getElementById('stat-inprogress'),
    tabs: Array.from(document.querySelectorAll('.tab-btn')),
    tbody: document.getElementById('courses-tbody'),
    addCourseBtn: document.getElementById('add-course-btn'),
    addCourseFooter: document.getElementById('add-course-footer'),
  };

  // =========================================================================
  // Theme Sync (Auto Dark / Light following OS / Notion Desktop setting)
  // =========================================================================
  function initThemeSync() {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('theme');
    if (forced === 'dark' || forced === 'light') {
      document.documentElement.setAttribute('data-theme', forced);
      return;
    }

    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (isDark) => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    };
    apply(mq.matches);

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', (e) => apply(e.matches));
    } else if (typeof mq.addListener === 'function') {
      mq.addListener((e) => apply(e.matches));
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(num) {
    const n = Number(num) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function notionColorToPill(notionColor, fallback) {
    const map = {
      blue: 'pill--blue',
      green: 'pill--green',
      yellow: 'pill--amber',
      orange: 'pill--amber',
      brown: 'pill--amber',
      purple: 'pill--purple',
      pink: 'pill--pink',
      red: 'pill--red',
      gray: 'pill--gray',
    };
    return map[notionColor] || fallback || 'pill--gray';
  }

  function getSemesterPillClass(course) {
    if (course.semesterColor && course.semesterColor !== 'default') {
      return notionColorToPill(course.semesterColor, 'pill--blue');
    }
    return 'pill--blue';
  }

  function getCategoryPillClass(course) {
    if (course.categoryColor && course.categoryColor !== 'default') {
      return notionColorToPill(course.categoryColor);
    }
    if (course.category === '전공필수') return 'pill--purple';
    if (course.category === '전공선택') return 'pill--blue';
    if (course.category === '교양') return 'pill--amber';
    return 'pill--gray';
  }

  function getStatusPillClass(course) {
    if (course.status === '수강완료') return 'pill--cyan';
    if (course.status === '수강중') return 'pill--green';
    return notionColorToPill(course.statusColor, 'pill--gray');
  }

  function getCreditPillClass(credits) {
    if (credits >= 3) return 'pill--green';
    if (credits === 2) return 'pill--amber';
    return 'pill--gray';
  }

  function defaultDocIconSvg() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="13" y2="17"/>
    </svg>`;
  }

  // =========================================================================
  // LocalStorage Cache (0.01s Instant First Render)
  // =========================================================================
  function readCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.summary && Array.isArray(parsed.courses)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota / private browsing errors
    }
  }

  // =========================================================================
  // Demo Dataset (activated via ?demo=1 for local preview)
  // =========================================================================
  function getDemoData() {
    const courses = [
      { id: '1', name: '인문학베이스캠프', credits: 2, status: '수강완료', category: '교양', semester: '2학년 2학기', semesterColor: 'blue', icon: '📘', url: null },
      { id: '2', name: '표현과소통 교양', credits: 2, status: '수강완료', category: '교양', semester: '2학년 2학기', semesterColor: 'brown', icon: '🎓', url: null },
      { id: '3', name: '자료구조와 알고리즘', credits: 3, status: '수강완료', category: '전공필수', semester: '2학년 1학기', semesterColor: 'purple', icon: '💻', url: null },
      { id: '4', name: '컴퓨터구조', credits: 3, status: '수강완료', category: '전공필수', semester: '2학년 1학기', semesterColor: 'purple', icon: '⚙️', url: null },
      { id: '5', name: '확률과 통계', credits: 2, status: '수강완료', category: '전공선택', semester: '1학년 2학기', semesterColor: 'gray', icon: '📊', url: null },
      { id: '6', name: '운영체제', credits: 3, status: '수강중', category: '전공필수', semester: '2학년 2학기', semesterColor: 'blue', icon: '🖥️', url: null },
      { id: '7', name: '웹프로그래밍', credits: 3, status: '수강중', category: '전공선택', semester: '2학년 2학기', semesterColor: 'blue', icon: '🌐', url: null },
      { id: '8', name: '데이터베이스설계', credits: 2, status: '수강중', category: '전공선택', semester: '2학년 2학기', semesterColor: 'blue', icon: '🗄️', url: null },
    ];
    return {
      summary: {
        goalCredits: GRADUATION_GOAL,
        completedCredits: 12,
        inProgressCredits: 8,
        remainingCredits: 124,
        completionRate: 8.8,
      },
      courses,
      databaseUrl: null,
      updatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  function showBanner(message) {
    if (!message) {
      el.statusBanner.classList.add('hidden');
      el.statusBanner.textContent = '';
      return;
    }
    el.statusBanner.textContent = message;
    el.statusBanner.classList.remove('hidden');
  }

  function setSyncing(syncing, labelText) {
    state.isSyncing = syncing;
    el.syncBtn.classList.toggle('is-syncing', syncing);
    if (labelText) {
      el.syncLabel.textContent = labelText;
    } else {
      el.syncLabel.textContent = syncing ? '갱신 중...' : '동기화';
    }
  }

  function renderSummary(summary) {
    const goal = summary.goalCredits || GRADUATION_GOAL;
    const completed = summary.completedCredits || 0;
    const inProgress = summary.inProgressCredits || 0;
    const remaining = typeof summary.remainingCredits === 'number'
      ? summary.remainingCredits
      : Math.max(0, goal - completed);
    const rate = typeof summary.completionRate === 'number'
      ? summary.completionRate
      : Math.min(100, Math.round((completed / goal) * 1000) / 10);

    const completedPct = Math.min(100, (completed / goal) * 100);
    const totalWithInProgressPct = Math.min(100, ((completed + inProgress) / goal) * 100);

    el.progressCompleted.textContent = formatNumber(completed);
    el.progressGoal.textContent = formatNumber(goal);
    el.progressPercent.textContent = rate.toFixed(1);
    el.progressInProgress.textContent = formatNumber(inProgress);

    el.progressBarContainer.setAttribute('aria-valuemax', String(goal));
    el.progressBarContainer.setAttribute('aria-valuenow', String(completed));
    el.progressFill.style.width = `${completedPct}%`;
    el.progressFillInProgress.style.width = `${totalWithInProgressPct}%`;

    el.statGoal.textContent = formatNumber(goal);
    el.statCompleted.textContent = formatNumber(completed);
    el.statRemaining.textContent = formatNumber(remaining);
    el.statInProgress.textContent = formatNumber(inProgress);
  }

  function renderDatabaseLinks(databaseUrl) {
    const targets = [el.addCourseBtn, el.addCourseFooter];
    for (const anchor of targets) {
      if (!anchor) continue;
      if (databaseUrl) {
        anchor.href = databaseUrl;
        anchor.classList.remove('is-disabled');
      } else {
        anchor.href = '#';
        anchor.classList.add('is-disabled');
      }
    }
  }

  function renderCourses() {
    const courses = state.data?.courses || [];
    const filtered = state.activeFilter === '전체'
      ? courses
      : courses.filter((c) => c.category === state.activeFilter);

    if (filtered.length === 0) {
      const emptyMsg = state.activeFilter === '전체'
        ? '등록된 과목이 없습니다. 노션 데이터베이스에 과목을 추가해 보세요.'
        : `'${state.activeFilter}'에 해당하는 과목이 없습니다.`;
      el.tbody.innerHTML = `<tr class="empty-row"><td class="empty-cell" colspan="5">${escapeHtml(emptyMsg)}</td></tr>`;
      return;
    }

    const html = filtered
      .map((course) => {
        const iconHtml = course.icon
          ? `<span class="course-icon" aria-hidden="true">${escapeHtml(course.icon)}</span>`
          : `<span class="course-icon" aria-hidden="true">${defaultDocIconSvg()}</span>`;

        const nameInner = `${iconHtml}<span>${escapeHtml(course.name)}</span>`;
        const nameCell = course.url
          ? `<a class="course-name-cell" href="${escapeHtml(course.url)}" target="_blank" rel="noopener noreferrer">${nameInner}</a>`
          : `<span class="course-name-cell">${nameInner}</span>`;

        const semesterHtml = course.semester
          ? `<span class="pill ${getSemesterPillClass(course)}">${escapeHtml(course.semester)}</span>`
          : `<span class="progress-muted">-</span>`;

        const categoryHtml = course.category
          ? `<span class="pill ${getCategoryPillClass(course)}">${escapeHtml(course.category)}</span>`
          : `<span class="progress-muted">-</span>`;

        const statusHtml = course.status
          ? `<span class="pill ${getStatusPillClass(course)}">${escapeHtml(course.status)}</span>`
          : `<span class="progress-muted">-</span>`;

        const creditsHtml = `<span class="pill ${getCreditPillClass(course.credits)}">${formatNumber(course.credits)}학점</span>`;

        return `<tr>
          <td>${nameCell}</td>
          <td class="col-semester">${semesterHtml}</td>
          <td class="col-category">${categoryHtml}</td>
          <td class="col-status">${statusHtml}</td>
          <td class="col-credits">${creditsHtml}</td>
        </tr>`;
      })
      .join('');

    el.tbody.innerHTML = html;
  }

  function renderAll(data) {
    state.data = data;
    renderSummary(data.summary);
    renderDatabaseLinks(data.databaseUrl);
    renderCourses();
  }

  // =========================================================================
  // Tab Filter Events
  // =========================================================================
  function initTabs() {
    for (const btn of el.tabs) {
      btn.addEventListener('click', () => {
        const nextFilter = btn.getAttribute('data-filter') || '전체';
        if (state.activeFilter === nextFilter) return;

        state.activeFilter = nextFilter;
        for (const tab of el.tabs) {
          const active = tab === btn;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        renderCourses();
      });
    }
  }

  // =========================================================================
  // Background Fetch from Vercel Serverless Function (/api/credits)
  // =========================================================================
  async function fetchLiveCredits(manual = false) {
    if (state.isSyncing) return;
    setSyncing(true);

    try {
      const url = manual ? `/api/credits?t=${Date.now()}` : '/api/credits';
      const response = await fetch(url, { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        const err = new Error(payload?.error || `HTTP ${response.status}`);
        err.code = payload?.code;
        throw err;
      }

      showBanner(null);
      renderAll(payload);
      writeCache(payload);
      setSyncing(false, '최신');
    } catch (error) {
      setSyncing(false, '재시도');

      if (error.code === 'MISSING_ENV') {
        showBanner('Vercel 환경변수(NOTION_API_KEY, NOTION_DATABASE_ID)를 설정하면 노션 데이터가 실시간으로 연동됩니다.');
      } else if (state.data) {
        showBanner(`실시간 갱신 실패 (${error.message}) — 마지막 저장된 데이터를 표시 중입니다.`);
      } else {
        showBanner(`노션 데이터를 불러오지 못했습니다: ${error.message}`);
        el.tbody.innerHTML = `<tr class="empty-row"><td class="empty-cell" colspan="5">데이터를 불러올 수 없습니다. 환경변수와 노션 데이터베이스 연결(통합 공유)을 확인해 주세요.</td></tr>`;
      }
    }
  }

  // =========================================================================
  // Bootstrap
  // =========================================================================
  function init() {
    initThemeSync();
    initTabs();

    el.syncBtn.addEventListener('click', () => fetchLiveCredits(true));

    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      renderAll(getDemoData());
      setSyncing(false, '데모');
      return;
    }

    // 1. Instant 0.01s render from localStorage cache
    const cached = readCache();
    if (cached) {
      renderAll(cached);
    }

    // 2. Background revalidate from /api/credits
    fetchLiveCredits(false);
  }

  init();
})();
