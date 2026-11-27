(function () {
  'use strict';

  const WIDGET_KEY = new URLSearchParams(window.location.search).get('k') || '';
  const KEY_SUFFIX = WIDGET_KEY ? `_${WIDGET_KEY.slice(-12)}` : '';
  const STORAGE_KEY = `notion_credit_tracker_v1${KEY_SUFFIX}`;
  const SETTINGS_KEY = `notion_credit_req_settings_v1${KEY_SUFFIX}`;
  const GRADUATION_GOAL = 136;
  const DEFAULT_SETTINGS = {
    totalGoal: 136,
    majorGoal: 75,
    basicMajorMin: 19,
    liberalMin: 39,
    liberalMax: 52,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        totalGoal: Number(parsed.totalGoal) > 0 ? Number(parsed.totalGoal) : DEFAULT_SETTINGS.totalGoal,
        majorGoal: Number(parsed.majorGoal) >= 0 ? Number(parsed.majorGoal) : DEFAULT_SETTINGS.majorGoal,
        basicMajorMin: Number(parsed.basicMajorMin) >= 0 ? Number(parsed.basicMajorMin) : DEFAULT_SETTINGS.basicMajorMin,
        liberalMin: Number(parsed.liberalMin) >= 0 ? Number(parsed.liberalMin) : DEFAULT_SETTINGS.liberalMin,
        liberalMax: Number(parsed.liberalMax) >= 0 ? Number(parsed.liberalMax) : DEFAULT_SETTINGS.liberalMax,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }

  function normalizeCourseCategory(cat) {
    const compact = String(cat || '').replace(/\s+/g, '');
    if (compact === '기본전공' || compact === '전공필수') return '기본전공';
    if (compact === '선택전공' || compact === '전공선택') return '선택전공';
    return cat || '';
  }

  function buildCreditsApiUrl(extraParams = {}) {
    const qs = new URLSearchParams();
    if (WIDGET_KEY) qs.set('k', WIDGET_KEY);
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const str = qs.toString();
    return str ? `/api/credits?${str}` : '/api/credits';
  }

  const state = {
    data: null,
    settings: loadSettings(),
    isReqOpen: false,
    activeFilter: '전체',
    statusFilter: '전체',
    isDemo: new URLSearchParams(window.location.search).get('demo') === '1',
    isSyncing: false,
    isSubmitting: false,
    selectedDays: new Set(),
  };

  const el = {
    syncBtn: document.getElementById('sync-btn'),
    syncLabel: document.getElementById('sync-label'),
    headerAddCourseBtn: document.getElementById('header-add-course-btn'),
    statusBanner: document.getElementById('status-banner'),
    progressCompleted: document.getElementById('progress-completed'),
    progressGoal: document.getElementById('progress-goal'),
    progressPercent: document.getElementById('progress-percent'),
    progressRemainingWithInProgress: document.getElementById('progress-remaining-with-inprogress'),
    progressBarContainer: document.getElementById('progress-bar-container'),
    progressFill: document.getElementById('progress-fill'),
    progressFillInProgress: document.getElementById('progress-fill-inprogress'),
    statGoal: document.getElementById('stat-goal'),
    statCompleted: document.getElementById('stat-completed'),
    statRemaining: document.getElementById('stat-remaining'),
    statInProgress: document.getElementById('stat-inprogress'),
    remainingToggleBtn: document.getElementById('remaining-toggle-btn'),
    requirementsPanel: document.getElementById('requirements-panel'),
    statFilterCards: Array.from(document.querySelectorAll('.stat-card--filterable')),
    tabs: Array.from(document.querySelectorAll('.tab-btn')),
    tbody: document.getElementById('courses-tbody'),
    addCourseBtn: document.getElementById('add-course-btn'),
    addCourseFooter: document.getElementById('add-course-footer'),

    // Modal elements
    addModal: document.getElementById('add-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalSubmitBtn: document.getElementById('modal-submit-btn'),
    addCourseForm: document.getElementById('add-course-form'),
    courseNameInput: document.getElementById('course-name-input'),
    courseSemesterSelect: document.getElementById('course-semester-select'),
    courseCategorySelect: document.getElementById('course-category-select'),
    courseStatusSelect: document.getElementById('course-status-select'),
    statusSegBtns: Array.from(document.querySelectorAll('.status-seg-btn')),
    courseCreditsSelect: document.getElementById('course-credits-select'),
    linkSubjectCheckbox: document.getElementById('link-subject-checkbox'),
    subjectExtraFields: document.getElementById('subject-extra-fields'),
    dayChips: Array.from(document.querySelectorAll('.day-chip')),
    courseTimeInput: document.getElementById('course-time-input'),
    courseRoomInput: document.getElementById('course-room-input'),
    courseProfInput: document.getElementById('course-prof-input'),
    modalError: document.getElementById('modal-error'),
  };

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
    const cat = normalizeCourseCategory(course.category);
    if (cat === '기본전공') return 'pill--purple';
    if (cat === '선택전공') return 'pill--blue';
    if (cat && cat.includes('교양')) return 'pill--amber';
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

  function trashIconSvg() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>`;
  }

  function recomputeSummary(courses) {
    const goal = state.settings.totalGoal || GRADUATION_GOAL;
    let completed = 0;
    let inProgress = 0;
    for (const c of courses) {
      const cr = Number(c.credits) || 0;
      if (c.status === '수강완료') completed += cr;
      else if (c.status === '수강중') inProgress += cr;
    }
    completed = Math.round(completed * 10) / 10;
    inProgress = Math.round(inProgress * 10) / 10;
    const remaining = Math.max(0, Math.round((goal - completed) * 10) / 10);
    const completionRate = Math.min(100, Math.round((completed / goal) * 1000) / 10);
    return {
      goalCredits: goal,
      completedCredits: completed,
      inProgressCredits: inProgress,
      remainingCredits: remaining,
      completionRate,
    };
  }

  // =========================================================================
  // Sorting: 1. 학기순 -> 2. 이수구분(기본전공, 선택전공, 교양, 일반) -> 3. 상태 -> 4. 학점순
  // =========================================================================
  function getSemesterOrder(semester) {
    const match = String(semester || '').match(/(\d+)\s*학년\s*(\d+)\s*학기/);
    if (match) {
      return Number(match[1]) * 10 + Number(match[2]);
    }
    return 999;
  }

  function getCategoryOrder(category) {
    const c = normalizeCourseCategory(category).replace(/\s+/g, '');
    if (c === '기본전공') return 1;
    if (c === '선택전공') return 2;
    if (c === '교양필수') return 3;
    if (c === '교양선택') return 4;
    if (c === '교양') return 5;
    if (c === '일반선택' || c === '일반') return 6;
    return 99;
  }

  function getStatusOrder(status) {
    const s = String(status || '').replace(/\s+/g, '');
    if (s === '수강중') return 1;
    if (s === '수강완료') return 2;
    return 99;
  }

  function sortCourses(courses) {
    return [...courses].sort((a, b) => {
      const semDiff = getSemesterOrder(a.semester) - getSemesterOrder(b.semester);
      if (semDiff !== 0) return semDiff;

      const catDiff = getCategoryOrder(a.category) - getCategoryOrder(b.category);
      if (catDiff !== 0) return catDiff;

      const statusDiff = getStatusOrder(a.status) - getStatusOrder(b.status);
      if (statusDiff !== 0) return statusDiff;

      const creditDiff = (Number(b.credits) || 0) - (Number(a.credits) || 0);
      if (creditDiff !== 0) return creditDiff;

      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });
  }

  // =========================================================================
  // LocalStorage Cache
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
    } catch {}
  }

  function getDemoData() {
    const courses = [
      { id: '1', name: '인문학베이스캠프', credits: 2, status: '수강완료', category: '교양필수', semester: '2학년 2학기', semesterColor: 'blue', icon: '📘', url: null },
      { id: '2', name: '표현과소통 교양', credits: 2, status: '수강완료', category: '교양선택', semester: '2학년 2학기', semesterColor: 'brown', icon: '🎓', url: null },
      { id: '3', name: '자료구조와 알고리즘', credits: 3, status: '수강완료', category: '기본전공', semester: '2학년 1학기', semesterColor: 'purple', icon: '💻', url: null },
      { id: '4', name: '컴퓨터구조', credits: 3, status: '수강완료', category: '기본전공', semester: '2학년 1학기', semesterColor: 'purple', icon: '⚙️', url: null },
      { id: '5', name: '확률과 통계', credits: 2, status: '수강완료', category: '선택전공', semester: '1학년 2학기', semesterColor: 'gray', icon: '📊', url: null },
      { id: '6', name: '운영체제', credits: 3, status: '수강중', category: '기본전공', semester: '2학년 2학기', semesterColor: 'blue', icon: '🖥️', url: null },
      { id: '7', name: '웹프로그래밍', credits: 3, status: '수강중', category: '선택전공', semester: '2학년 2학기', semesterColor: 'blue', icon: '🌐', url: null },
      { id: '8', name: '데이터베이스설계', credits: 2, status: '수강중', category: '선택전공', semester: '2학년 2학기', semesterColor: 'blue', icon: '🗄️', url: null },
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
    const goal = state.settings.totalGoal || summary.goalCredits || GRADUATION_GOAL;
    const completed = summary.completedCredits || 0;
    const inProgress = summary.inProgressCredits || 0;
    const remaining = Math.max(0, Math.round((goal - completed) * 10) / 10);
    const remainingWithInProgress = Math.max(0, Math.round((goal - completed - inProgress) * 10) / 10);
    const rate = Math.min(100, Math.round((completed / goal) * 1000) / 10);

    const completedPct = Math.min(100, (completed / goal) * 100);
    const totalWithInProgressPct = Math.min(100, ((completed + inProgress) / goal) * 100);

    el.progressCompleted.textContent = formatNumber(completed);
    el.progressGoal.textContent = formatNumber(goal);
    el.progressPercent.textContent = rate.toFixed(1);
    if (el.progressRemainingWithInProgress) {
      el.progressRemainingWithInProgress.textContent = formatNumber(remainingWithInProgress);
    }

    el.progressBarContainer.setAttribute('aria-valuemax', String(goal));
    el.progressBarContainer.setAttribute('aria-valuenow', String(completed));
    el.progressFill.style.width = `${completedPct}%`;
    el.progressFillInProgress.style.width = `${totalWithInProgressPct}%`;

    el.statGoal.textContent = formatNumber(goal);
    el.statCompleted.textContent = formatNumber(completed);
    el.statRemaining.textContent = formatNumber(remaining);
    el.statInProgress.textContent = formatNumber(inProgress);

    renderRequirementsPanel();
  }

  function computeCategoryBreakdown(courses) {
    const buckets = {
      basicMajor: { done: 0, ing: 0 },
      electiveMajor: { done: 0, ing: 0 },
      liberalReq: { done: 0, ing: 0 },
      liberalElec: { done: 0, ing: 0 },
      generalElec: { done: 0, ing: 0 },
    };

    for (const c of courses) {
      const cr = Number(c.credits) || 0;
      const cat = normalizeCourseCategory(c.category).replace(/\s+/g, '');
      const isDone = c.status === '수강완료';
      const isIng = c.status === '수강중';
      if (!isDone && !isIng) continue;

      let key = 'generalElec';
      if (cat === '기본전공') key = 'basicMajor';
      else if (cat === '선택전공') key = 'electiveMajor';
      else if (cat === '교양필수') key = 'liberalReq';
      else if (cat === '교양선택' || cat === '교양') key = 'liberalElec';
      else if (cat === '일반선택' || cat === '일반') key = 'generalElec';

      if (isDone) buckets[key].done += cr;
      else if (isIng) buckets[key].ing += cr;
    }

    for (const k of Object.keys(buckets)) {
      buckets[k].done = Math.round(buckets[k].done * 10) / 10;
      buckets[k].ing = Math.round(buckets[k].ing * 10) / 10;
    }
    return buckets;
  }

  function renderRequirementsPanel() {
    if (!el.requirementsPanel) return;
    if (!state.isReqOpen) {
      el.requirementsPanel.classList.add('hidden');
      return;
    }

    el.requirementsPanel.classList.remove('hidden');
    const courses = state.data?.courses || [];
    const b = computeCategoryBreakdown(courses);
    const s = state.settings;

    const majorDone = Math.round((b.basicMajor.done + b.electiveMajor.done) * 10) / 10;
    const majorIng = Math.round((b.basicMajor.ing + b.electiveMajor.ing) * 10) / 10;
    const basicRem = Math.max(0, Math.round((s.basicMajorMin - b.basicMajor.done) * 10) / 10);
    const majorRem = Math.max(0, Math.round((s.majorGoal - majorDone) * 10) / 10);
    const majorDonePct = s.majorGoal > 0 ? Math.min(100, (majorDone / s.majorGoal) * 100) : 0;
    const majorIngPct = s.majorGoal > 0 ? Math.min(100, ((majorDone + majorIng) / s.majorGoal) * 100) : 0;

    const liberalDone = Math.round((b.liberalReq.done + b.liberalElec.done) * 10) / 10;
    const liberalIng = Math.round((b.liberalReq.ing + b.liberalElec.ing) * 10) / 10;
    const liberalMinRem = Math.max(0, Math.round((s.liberalMin - liberalDone) * 10) / 10);
    const liberalMaxRem = Math.max(0, Math.round((s.liberalMax - liberalDone) * 10) / 10);
    const liberalDonePct = s.liberalMax > 0 ? Math.min(100, (liberalDone / s.liberalMax) * 100) : 0;
    const liberalIngPct = s.liberalMax > 0 ? Math.min(100, ((liberalDone + liberalIng) / s.liberalMax) * 100) : 0;

    const freeGoal = Math.max(0, Math.round((s.totalGoal - s.majorGoal - s.liberalMax) * 10) / 10);
    const freeDone = b.generalElec.done;
    const freeIng = b.generalElec.ing;
    const freeRem = Math.max(0, Math.round((freeGoal - freeDone) * 10) / 10);
    const freeDonePct = freeGoal > 0 ? Math.min(100, (freeDone / freeGoal) * 100) : (freeDone > 0 ? 100 : 0);
    const freeIngPct = freeGoal > 0 ? Math.min(100, ((freeDone + freeIng) / freeGoal) * 100) : (freeDone + freeIng > 0 ? 100 : 0);

    el.requirementsPanel.innerHTML = `
      <div class="req-panel-head">
        <div class="req-panel-title">영역별 졸업 요건 및 남은 학점</div>
        <div class="req-panel-hint">
          전체 목표
          <button type="button" class="req-badge-btn" data-setting="totalGoal" title="클릭해서 전체 졸업 학점 수정">${formatNumber(s.totalGoal)}학점 ✎</button>
          · 기준 숫자를 클릭하면 바로 수정됩니다
        </div>
      </div>

      <div class="req-grid">
        <!-- 전공 카드 -->
        <div class="req-card">
          <div class="req-card-head">
            <span class="req-card-title">전공</span>
            <button type="button" class="req-badge-btn" data-setting="majorGoal" title="클릭해서 전공 목표 학점 수정">목표 ${formatNumber(s.majorGoal)}학점 ✎</button>
          </div>
          <div class="req-bar-track">
            <div class="req-bar-inprogress" style="width:${majorIngPct}%"></div>
            <div class="req-bar-fill" style="width:${majorDonePct}%"></div>
          </div>
          <div class="req-rows">
            <div class="req-row">
              <span class="req-row-label">
                기본전공
                <button type="button" class="req-badge-btn" data-setting="basicMajorMin" title="클릭해서 기본전공 최소 학점 수정">최소 ${formatNumber(s.basicMajorMin)} ✎</button>
              </span>
              <span class="req-row-val">
                ${formatNumber(b.basicMajor.done)}이수${b.basicMajor.ing ? ` (+${formatNumber(b.basicMajor.ing)})` : ''} ·
                ${basicRem === 0 ? '<span class="is-done">달성 ✓</span>' : `<span class="is-rem">${formatNumber(basicRem)} 남음</span>`}
              </span>
            </div>
            <div class="req-row">
              <span class="req-row-label">선택전공</span>
              <span class="req-row-val">${formatNumber(b.electiveMajor.done)}이수${b.electiveMajor.ing ? ` (+${formatNumber(b.electiveMajor.ing)} 수강중)` : ''}</span>
            </div>
            <div class="req-row">
              <span class="req-row-label">전공 합계</span>
              <span class="req-row-val">
                ${formatNumber(majorDone)} / ${formatNumber(s.majorGoal)} ·
                ${majorRem === 0 ? '<span class="is-done">달성 ✓</span>' : `<span class="is-rem">${formatNumber(majorRem)} 남음</span>`}
              </span>
            </div>
          </div>
          <div class="req-sub-note">기본전공 ${formatNumber(s.basicMajorMin)}학점 이상 + 선택전공으로 총 ${formatNumber(s.majorGoal)}학점 이상 이수</div>
        </div>

        <!-- 교양 카드 -->
        <div class="req-card">
          <div class="req-card-head">
            <span class="req-card-title">교양</span>
            <span>
              <button type="button" class="req-badge-btn" data-setting="liberalMin" title="클릭해서 교양 최소 학점 수정">최소 ${formatNumber(s.liberalMin)} ✎</button>
              <button type="button" class="req-badge-btn" data-setting="liberalMax" title="클릭해서 교양 최대 학점 수정">최대 ${formatNumber(s.liberalMax)} ✎</button>
            </span>
          </div>
          <div class="req-bar-track">
            <div class="req-bar-inprogress" style="width:${liberalIngPct}%"></div>
            <div class="req-bar-fill" style="width:${liberalDonePct}%"></div>
          </div>
          <div class="req-rows">
            <div class="req-row">
              <span class="req-row-label">교양필수</span>
              <span class="req-row-val">${formatNumber(b.liberalReq.done)}이수${b.liberalReq.ing ? ` (+${formatNumber(b.liberalReq.ing)} 수강중)` : ''}</span>
            </div>
            <div class="req-row">
              <span class="req-row-label">교양선택</span>
              <span class="req-row-val">${formatNumber(b.liberalElec.done)}이수${b.liberalElec.ing ? ` (+${formatNumber(b.liberalElec.ing)} 수강중)` : ''}</span>
            </div>
            <div class="req-row">
              <span class="req-row-label">교양 합계</span>
              <span class="req-row-val">
                ${formatNumber(liberalDone)}학점 ·
                ${liberalMinRem === 0 ? '<span class="is-done">최소 달성 ✓</span>' : `<span class="is-rem">최소까지 ${formatNumber(liberalMinRem)} 남음</span>`}
              </span>
            </div>
          </div>
          <div class="req-sub-note">최대 ${formatNumber(s.liberalMax)}학점까지 인정 (잔여 가능 ${formatNumber(liberalMaxRem)}학점)</div>
        </div>

        <!-- 일반선택 / 잔여 자유 학점 카드 -->
        <div class="req-card">
          <div class="req-card-head">
            <span class="req-card-title">일반선택 · 잔여</span>
            <span class="req-badge-btn" style="cursor:default;border-style:solid;">자동 ${formatNumber(freeGoal)}학점</span>
          </div>
          <div class="req-bar-track">
            <div class="req-bar-inprogress" style="width:${freeIngPct}%"></div>
            <div class="req-bar-fill" style="width:${freeDonePct}%"></div>
          </div>
          <div class="req-rows">
            <div class="req-row">
              <span class="req-row-label">계산식</span>
              <span class="req-row-val">${formatNumber(s.totalGoal)} - ${formatNumber(s.majorGoal)} - ${formatNumber(s.liberalMax)} = ${formatNumber(freeGoal)}</span>
            </div>
            <div class="req-row">
              <span class="req-row-label">일반선택 이수</span>
              <span class="req-row-val">${formatNumber(freeDone)}이수${freeIng ? ` (+${formatNumber(freeIng)} 수강중)` : ''}</span>
            </div>
            <div class="req-row">
              <span class="req-row-label">남은 학점</span>
              <span class="req-row-val">
                ${freeRem === 0 ? '<span class="is-done">달성 ✓</span>' : `<span class="is-rem">${formatNumber(freeRem)} 남음</span>`}
              </span>
            </div>
          </div>
          <div class="req-sub-note">선택전공 또는 일반선택 과목으로 채울 수 있는 학점입니다.</div>
        </div>
      </div>
    `;
  }

  function initRequirementsPanel() {
    if (el.remainingToggleBtn) {
      el.remainingToggleBtn.addEventListener('click', () => {
        state.isReqOpen = !state.isReqOpen;
        el.remainingToggleBtn.classList.toggle('is-expanded', state.isReqOpen);
        el.remainingToggleBtn.setAttribute('aria-expanded', state.isReqOpen ? 'true' : 'false');
        renderRequirementsPanel();
      });
    }

    if (el.requirementsPanel) {
      el.requirementsPanel.addEventListener('click', (e) => {
        const btn = e.target.closest('.req-badge-btn[data-setting]');
        if (!btn || btn.querySelector('input')) return;
        const key = btn.getAttribute('data-setting');
        if (!key || !(key in state.settings)) return;

        const currentVal = state.settings[key];
        const input = document.createElement('input');
        input.type = 'number';
        input.min = key === 'totalGoal' ? '1' : '0';
        input.max = '300';
        input.step = '1';
        input.className = 'req-inline-input';
        input.value = String(currentVal);

        btn.textContent = '';
        btn.appendChild(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const nextVal = Number(input.value);
          const minVal = key === 'totalGoal' ? 1 : 0;
          if (Number.isFinite(nextVal) && nextVal >= minVal) {
            state.settings[key] = Math.round(nextVal * 10) / 10;
            saveSettings(state.settings);
          }
          if (state.data) {
            const nextSummary = recomputeSummary(state.data.courses || []);
            state.data = { ...state.data, summary: nextSummary };
            renderSummary(nextSummary);
          } else {
            renderRequirementsPanel();
          }
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            commit();
          } else if (ev.key === 'Escape') {
            committed = true;
            renderRequirementsPanel();
          }
        });
      });
    }
  }

  function renderCourses() {
    const rawCourses = state.data?.courses || [];
    const sorted = sortCourses(rawCourses);
    const filtered = sorted.filter((c) => {
      if (state.statusFilter !== '전체' && c.status !== state.statusFilter) {
        return false;
      }
      if (state.activeFilter === '전체') return true;
      const cat = normalizeCourseCategory(c.category);
      if (state.activeFilter === '교양선택') {
        return cat === '교양선택' || cat === '교양';
      }
      if (state.activeFilter === '일반선택') {
        return cat === '일반선택' || cat === '일반';
      }
      return cat === state.activeFilter;
    });

    if (filtered.length === 0) {
      const filters = [
        state.statusFilter !== '전체' ? state.statusFilter : '',
        state.activeFilter !== '전체' ? state.activeFilter : '',
      ].filter(Boolean);
      const emptyMsg = filters.length === 0
        ? '등록된 과목이 없습니다. 상단 [+ 과목 추가] 버튼을 눌러 과목을 추가해 보세요.'
        : `'${filters.join(' · ')}'에 해당하는 과목이 없습니다.`;
      el.tbody.innerHTML = `<tr class="empty-row"><td class="empty-cell" colspan="6">${escapeHtml(emptyMsg)}</td></tr>`;
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

        const deleteBtnHtml = `<button type="button" class="delete-course-btn" data-course-id="${escapeHtml(course.id)}" title="과목 삭제" aria-label="${escapeHtml(course.name)} 삭제">${trashIconSvg()}</button>`;

        return `<tr>
          <td>${nameCell}</td>
          <td class="col-semester">${semesterHtml}</td>
          <td class="col-category">${categoryHtml}</td>
          <td class="col-status">${statusHtml}</td>
          <td class="col-credits">${creditsHtml}</td>
          <td class="col-actions">${deleteBtnHtml}</td>
        </tr>`;
      })
      .join('');

    el.tbody.innerHTML = html;
  }

  function renderAll(data) {
    state.data = data;
    renderSummary(data.summary);
    renderCourses();
  }

  // =========================================================================
  // Tabs & Summary Card Status Filter
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

  function setStatusFilter(nextStatus) {
    state.statusFilter = nextStatus;
    for (const card of el.statFilterCards) {
      const cardStatus = card.getAttribute('data-status-filter') || '전체';
      card.classList.toggle('is-filter-active', cardStatus === nextStatus);
    }
    renderCourses();
  }

  function initStatFilters() {
    for (const card of el.statFilterCards) {
      card.addEventListener('click', () => {
        const targetStatus = card.getAttribute('data-status-filter') || '전체';
        if (targetStatus !== '전체' && state.statusFilter === targetStatus) {
          setStatusFilter('전체');
        } else {
          setStatusFilter(targetStatus);
        }
      });
    }
  }

  // =========================================================================
  // Delete Course (with inline 2-step confirmation for Notion iframe safety)
  // =========================================================================
  async function deleteCourse(courseId, btn) {
    if (!courseId || !state.data) return;

    if (state.isDemo) {
      const nextCourses = (state.data.courses || []).filter((c) => c.id !== courseId);
      const nextData = {
        ...state.data,
        courses: nextCourses,
        summary: recomputeSummary(nextCourses),
      };
      renderAll(nextData);
      return;
    }

    btn.disabled = true;
    btn.textContent = '삭제중';

    try {
      const response = await fetch(buildCreditsApiUrl(), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: courseId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `삭제 실패 (HTTP ${response.status})`);
      }

      const nextCourses = (state.data.courses || []).filter((c) => c.id !== courseId);
      const nextData = {
        ...state.data,
        courses: nextCourses,
        summary: recomputeSummary(nextCourses),
      };
      renderAll(nextData);
      writeCache(nextData);

      await fetchLiveCredits(true);
      if (result.warning) {
        showBanner(`과목은 삭제되었으나 ${result.warning}`);
      }
    } catch (error) {
      btn.disabled = false;
      btn.classList.remove('is-confirming');
      btn.innerHTML = trashIconSvg();
      showBanner(`과목 삭제 실패: ${error.message}`);
    }
  }

  function initTableActions() {
    el.tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-course-btn');
      if (!btn || btn.disabled) return;
      const courseId = btn.getAttribute('data-course-id');
      if (!courseId) return;

      if (!btn.classList.contains('is-confirming')) {
        // Reset any other confirming buttons
        for (const other of el.tbody.querySelectorAll('.delete-course-btn.is-confirming')) {
          other.classList.remove('is-confirming');
          other.innerHTML = trashIconSvg();
        }
        btn.classList.add('is-confirming');
        btn.textContent = '삭제';
        clearTimeout(btn._confirmTimer);
        btn._confirmTimer = setTimeout(() => {
          if (btn.isConnected && btn.classList.contains('is-confirming') && !btn.disabled) {
            btn.classList.remove('is-confirming');
            btn.innerHTML = trashIconSvg();
          }
        }, 3000);
        return;
      }

      clearTimeout(btn._confirmTimer);
      deleteCourse(courseId, btn);
    });
  }

  // =========================================================================
  // Add Course Modal
  // =========================================================================
  function showModalError(msg) {
    if (!msg) {
      el.modalError.classList.add('hidden');
      el.modalError.textContent = '';
      return;
    }
    el.modalError.textContent = msg;
    el.modalError.classList.remove('hidden');
  }

  function setModalStatus(statusVal) {
    const target = statusVal === '수강완료' ? '수강완료' : '수강중';
    el.courseStatusSelect.value = target;
    for (const btn of el.statusSegBtns) {
      btn.classList.toggle('is-active', btn.getAttribute('data-status') === target);
    }
  }

  function openAddModal() {
    showModalError(null);
    el.addCourseForm.reset();
    setModalStatus(state.statusFilter === '수강완료' ? '수강완료' : '수강중');
    state.selectedDays.clear();
    for (const chip of el.dayChips) {
      chip.classList.remove('is-selected');
    }
    el.linkSubjectCheckbox.checked = true;
    el.subjectExtraFields.classList.remove('hidden');

    if (state.activeFilter !== '전체' && state.activeFilter !== '교양') {
      el.courseCategorySelect.value = state.activeFilter;
    }

    el.addModal.classList.remove('hidden');
    setTimeout(() => el.courseNameInput.focus(), 40);
  }

  function closeAddModal() {
    if (state.isSubmitting) return;
    el.addModal.classList.add('hidden');
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const name = el.courseNameInput.value.trim();
    if (!name) {
      showModalError('과목명을 입력해 주세요.');
      return;
    }

    state.isSubmitting = true;
    el.modalSubmitBtn.disabled = true;
    el.modalSubmitBtn.textContent = '추가 중...';
    showModalError(null);

    const payload = {
      name,
      semester: el.courseSemesterSelect.value,
      category: el.courseCategorySelect.value,
      status: el.courseStatusSelect.value,
      credits: Number(el.courseCreditsSelect.value),
      linkToSubject: el.linkSubjectCheckbox.checked,
      days: Array.from(state.selectedDays),
      time: el.courseTimeInput.value.trim(),
      room: el.courseRoomInput.value.trim(),
      professor: el.courseProfInput.value.trim(),
    };

    try {
      if (state.isDemo) {
        const nextCourses = [
          ...(state.data?.courses || []),
          {
            id: `demo-${Date.now()}`,
            name: payload.name,
            credits: payload.credits,
            status: payload.status,
            category: payload.category,
            semester: payload.semester,
            semesterColor: 'blue',
            icon: null,
            url: null,
          },
        ];
        renderAll({
          ...state.data,
          courses: nextCourses,
          summary: recomputeSummary(nextCourses),
        });
        state.isSubmitting = false;
        el.modalSubmitBtn.disabled = false;
        el.modalSubmitBtn.textContent = '추가하기';
        el.addModal.classList.add('hidden');
        return;
      }

      const response = await fetch(buildCreditsApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || `HTTP ${response.status}`);
      }

      state.isSubmitting = false;
      el.modalSubmitBtn.disabled = false;
      el.modalSubmitBtn.textContent = '추가하기';
      el.addModal.classList.add('hidden');

      await fetchLiveCredits(true);
      if (result.subjectWarning) {
        showBanner(`과목은 추가되었으나 ${result.subjectWarning}`);
      }
    } catch (error) {
      state.isSubmitting = false;
      el.modalSubmitBtn.disabled = false;
      el.modalSubmitBtn.textContent = '추가하기';
      showModalError(error.message || '과목 추가 중 오류가 발생했습니다.');
    }
  }

  function initModal() {
    if (el.headerAddCourseBtn) {
      el.headerAddCourseBtn.addEventListener('click', openAddModal);
    }
    el.addCourseBtn.addEventListener('click', openAddModal);
    el.addCourseFooter.addEventListener('click', openAddModal);
    el.modalCloseBtn.addEventListener('click', closeAddModal);
    el.modalCancelBtn.addEventListener('click', closeAddModal);
    el.addModal.addEventListener('click', (e) => {
      if (e.target === el.addModal) closeAddModal();
    });

    for (const btn of el.statusSegBtns) {
      btn.addEventListener('click', () => {
        setModalStatus(btn.getAttribute('data-status'));
      });
    }

    el.linkSubjectCheckbox.addEventListener('change', () => {
      el.subjectExtraFields.classList.toggle('hidden', !el.linkSubjectCheckbox.checked);
    });

    for (const chip of el.dayChips) {
      chip.addEventListener('click', () => {
        const day = chip.getAttribute('data-day');
        if (!day) return;
        if (state.selectedDays.has(day)) {
          state.selectedDays.delete(day);
          chip.classList.remove('is-selected');
        } else {
          state.selectedDays.add(day);
          chip.classList.add('is-selected');
        }
      });
    }

    el.addCourseForm.addEventListener('submit', handleAddSubmit);
  }

  // =========================================================================
  // Fetch Live Data
  // =========================================================================
  async function fetchLiveCredits(manual = false) {
    if (state.isSyncing) return;
    setSyncing(true);

    try {
      const url = manual ? buildCreditsApiUrl({ t: Date.now() }) : buildCreditsApiUrl();
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
        el.tbody.innerHTML = `<tr class="empty-row"><td class="empty-cell" colspan="6">데이터를 불러올 수 없습니다. 환경변수와 노션 데이터베이스 연결(통합 공유)을 확인해 주세요.</td></tr>`;
      }
    }
  }

  function init() {
    initThemeSync();
    initTabs();
    initStatFilters();
    initRequirementsPanel();
    initTableActions();
    initModal();

    el.syncBtn.addEventListener('click', () => fetchLiveCredits(true));

    if (state.isDemo) {
      renderAll(getDemoData());
      setSyncing(false, '데모');
      return;
    }

    if (!WIDGET_KEY) {
      setSyncing(false, '연동 필요');
      showBanner('노션 연동이 필요합니다. /connect 페이지에서 전용 임베드 링크를 발급받아 접속해 주세요.');
      el.tbody.innerHTML = `<tr class="empty-row"><td class="empty-cell" colspan="6">노션 연동이 필요합니다. <a href="/connect" style="color:inherit;text-decoration:underline;">/connect</a> 에서 전용 링크를 생성해 주세요.</td></tr>`;
      return;
    }

    const cached = readCache();
    if (cached) {
      renderAll(cached);
    }

    fetchLiveCredits(false);
  }

  init();
})();
