(() => {
  'use strict';

  const DAYS = ['월', '화', '수', '목', '금'];
  const START_HOUR = 9;
  const END_HOUR = 20; // 11 rows: 09:00~10:00 .. 19:00~20:00
  const ROW_COUNT = END_HOUR - START_HOUR;
  const GRADES = [1, 2, 3, 4];
  const TERMS = [1, 2];
  const TOTAL_STANDARD_SEMESTERS = GRADES.length * TERMS.length; // 8

  const CACHE_KEY = 'notion_timetable_widget_cache_v1';
  const CUSTOM_SEMS_KEY = 'notion_timetable_custom_semesters_v1';
  const ACTIVE_SEM_KEY = 'notion_timetable_active_semester_v1';

  const urlParams = new URLSearchParams(window.location.search);
  const IS_DEMO = urlParams.get('demo') === '1';

  // Exact sample data matching the reference screenshot for ?demo=1 preview
  const DEMO_COURSES = [
    {
      id: 'demo-1',
      name: '오픈소스SW응용',
      days: ['월', '수'],
      time: '09:00~11:00 / 09:00~10:00',
      semester: '2학년 2학기',
      category: '전공선택',
      room: '104호',
    },
    {
      id: 'demo-2',
      name: '알고리즘',
      days: ['월', '화'],
      time: '11:00~13:00 / 10:00~11:00',
      semester: '2학년 2학기',
      category: '전공필수',
      room: '104호',
    },
    {
      id: 'demo-3',
      name: '컴퓨터조직',
      days: ['화', '수'],
      time: '11:00~13:00 / 11:00~13:00',
      semester: '2학년 2학기',
      category: '전공필수',
      room: '104호',
    },
    {
      id: 'demo-4',
      name: '근대문명과전쟁',
      days: ['화'],
      time: '13:00~15:00',
      semester: '2학년 2학기',
      category: '교양',
      room: '',
    },
    {
      id: 'demo-5',
      name: '인문학베이스캠프',
      days: ['수'],
      time: '15:00~17:00',
      semester: '2학년 2학기',
      category: '교양',
      room: '',
    },
    {
      id: 'demo-6',
      name: '프로그래밍언어론',
      days: ['목'],
      time: '15:00~18:00',
      semester: '2학년 2학기',
      category: '전공선택',
      room: '',
    },
    {
      id: 'demo-7',
      name: '사회적경제와청년창업',
      days: ['월'],
      time: '17:00~20:00',
      semester: '2학년 2학기',
      category: '교양',
      room: '',
    },
    {
      id: 'demo-8',
      name: '자료구조',
      days: ['월', '수'],
      time: '10:00~12:00 / 10:00~11:00',
      semester: '2학년 1학기',
      category: '전공필수',
      room: '201호',
    },
    {
      id: 'demo-9',
      name: '선형대수학',
      days: ['화', '목'],
      time: '13:00~15:00',
      semester: '2학년 1학기',
      category: '전공선택',
      room: '305호',
    },
    {
      id: 'demo-10',
      name: '컴퓨터개론',
      days: ['월', '수'],
      time: '13:00~15:00',
      semester: '1학년 1학기',
      category: '전공필수',
      room: '101호',
    },
  ];

  // State
  const state = {
    courses: [],
    customSemesters: loadJson(CUSTOM_SEMS_KEY, []),
    activeSemester: localStorage.getItem(ACTIVE_SEM_KEY) || '',
    selectedGrade: null,
    selectedTerm: null,
    isSyncing: false,
    modalMode: 'add', // 'add' | 'edit'
  };

  // DOM References
  const els = {
    semesterTabs: document.getElementById('semester-tabs'),
    addSemesterBtn: document.getElementById('add-semester-btn'),
    semesterPopover: document.getElementById('semester-popover'),
    gradeOptions: document.getElementById('grade-options'),
    termOptions: document.getElementById('term-options'),
    cancelSemesterBtn: document.getElementById('cancel-semester-btn'),
    confirmSemesterBtn: document.getElementById('confirm-semester-btn'),
    syncBtn: document.getElementById('sync-btn'),
    addCourseBtn: document.getElementById('add-course-btn'),
    statusBanner: document.getElementById('status-banner'),
    timeCol: document.getElementById('tt-time-col'),
    daysCols: document.getElementById('tt-days-cols'),
    quickForm: document.getElementById('quick-form'),
    quickInput: document.getElementById('quick-input'),
    quickRawText: document.getElementById('quick-raw-text'),
    quickChips: document.getElementById('quick-chips'),
    modalBackdrop: document.getElementById('course-modal-backdrop'),
    modalTitle: document.getElementById('course-modal-title'),
    closeCourseModal: document.getElementById('close-course-modal'),
    cancelCourseBtn: document.getElementById('cancel-course-btn'),
    deleteCourseBtn: document.getElementById('delete-course-btn'),
    saveCourseBtn: document.getElementById('save-course-btn'),
    courseForm: document.getElementById('course-form'),
    courseId: document.getElementById('course-id'),
    courseName: document.getElementById('course-name'),
    courseSemester: document.getElementById('course-semester'),
    courseCategory: document.getElementById('course-category'),
    courseDaysGroup: document.getElementById('course-days-group'),
    courseTime: document.getElementById('course-time'),
    courseRoom: document.getElementById('course-room'),
    courseFormError: document.getElementById('course-form-error'),
  };

  /* ========================================================================
     Storage & Helpers
     ======================================================================== */
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          courses: state.courses,
          updatedAt: Date.now(),
        })
      );
      localStorage.setItem(CUSTOM_SEMS_KEY, JSON.stringify(state.customSemesters));
      if (state.activeSemester) {
        localStorage.setItem(ACTIVE_SEM_KEY, state.activeSemester);
      }
    } catch {
      // ignore quota errors
    }
  }

  function showBanner(message, type = 'warn', autoHideMs = 0) {
    if (!message) {
      els.statusBanner.classList.add('hidden');
      return;
    }
    els.statusBanner.textContent = message;
    els.statusBanner.className = `tt-banner${type === 'error' ? ' is-error' : type === 'info' ? ' is-info' : ''}`;
    if (autoHideMs > 0) {
      clearTimeout(showBanner._timer);
      showBanner._timer = setTimeout(() => {
        els.statusBanner.classList.add('hidden');
      }, autoHideMs);
    }
  }

  function parseSemesterOrder(sem) {
    const match = String(sem || '').match(/(\d)\s*학년\s*(\d)\s*학기/);
    if (!match) return -1;
    return Number(match[1]) * 10 + Number(match[2]);
  }

  function formatSemesterLabel(grade, term) {
    return `${grade}학년 ${term}학기`;
  }

  function getAllSemesters() {
    const set = new Set();
    for (const c of state.courses) {
      if (c.semester && c.semester.trim()) {
        set.add(c.semester.trim());
      }
    }
    for (const s of state.customSemesters) {
      if (s && s.trim()) {
        set.add(s.trim());
      }
    }
    if (set.size === 0) {
      set.add('1학년 1학기');
    }
    return Array.from(set).sort((a, b) => {
      const diff = parseSemesterOrder(b) - parseSemesterOrder(a);
      return diff !== 0 ? diff : a.localeCompare(b, 'ko');
    });
  }

  function ensureActiveSemester() {
    const semesters = getAllSemesters();
    if (!state.activeSemester || !semesters.includes(state.activeSemester)) {
      state.activeSemester = semesters[0];
    }
    return semesters;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function minutesToLabel(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${pad2(h)}:${pad2(m)}`;
  }

  function parseTimeToken(token) {
    const cleaned = String(token || '').trim();
    if (!cleaned) return null;

    // HH:MM or H:MM
    let m = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h >= 0 && h <= 24 && min >= 0 && min < 60) return h * 60 + min;
      return null;
    }

    // HHMM (e.g., 0900, 1130) or HMM (e.g., 930)
    m = cleaned.match(/^(\d{3,4})$/);
    if (m) {
      const digits = m[1].padStart(4, '0');
      const h = Number(digits.slice(0, 2));
      const min = Number(digits.slice(2, 4));
      if (h >= 0 && h <= 24 && min >= 0 && min < 60) return h * 60 + min;
      return null;
    }

    // Single hour like 9 or 13
    m = cleaned.match(/^(\d{1,2})$/);
    if (m) {
      const h = Number(m[1]);
      if (h >= 0 && h <= 24) return h * 60;
    }

    return null;
  }

  function parseTimeRange(segment) {
    const str = String(segment || '').trim();
    if (!str) return null;

    // Optional day prefix inside segment (e.g. "월 09:00~11:00")
    const dayMatch = str.match(/^(월|화|수|목|금)\s*(.+)$/);
    const explicitDay = dayMatch ? dayMatch[1] : null;
    const rangePart = dayMatch ? dayMatch[2].trim() : str;

    const parts = rangePart.split(/\s*(?:~|-|–|—)\s*/);
    if (parts.length !== 2) return null;

    const startMin = parseTimeToken(parts[0]);
    const endMin = parseTimeToken(parts[1]);
    if (startMin === null || endMin === null || endMin <= startMin) return null;

    return {
      day: explicitDay,
      startMin,
      endMin,
      label: `${minutesToLabel(startMin)}~${minutesToLabel(endMin)}`,
    };
  }

  // Parse course.days + course.time into array of { day, startMin, endMin, label }
  function parseCourseSlots(course) {
    const days = Array.isArray(course.days)
      ? course.days.filter((d) => DAYS.includes(d))
      : [];
    const rawTime = String(course.time || '').trim();
    if (!rawTime) return [];

    const segments = rawTime
      .split(/\s*[/,;]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedSegments = segments.map(parseTimeRange).filter(Boolean);
    if (parsedSegments.length === 0) return [];

    const slots = [];

    // Case 1: Segments explicitly carry day prefixes
    if (parsedSegments.every((s) => s.day)) {
      return parsedSegments;
    }

    // Case 2: Pair days[i] with parsedSegments[i] (or fallback to first/last segment)
    if (days.length > 0) {
      days.forEach((day, idx) => {
        const seg = parsedSegments[idx] || parsedSegments[parsedSegments.length - 1];
        if (seg) {
          slots.push({
            day,
            startMin: seg.startMin,
            endMin: seg.endMin,
            label: seg.label,
          });
        }
      });
    }

    return slots;
  }

  /* ========================================================================
     Quick Input Bar Parser (e.g. "월 1100-1300" or "알고리즘 월 1100-1300 104호")
     ======================================================================== */
  function parseQuickInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return { empty: true, name: '', slots: [], room: '' };

    // Find all occurrences of: <Day> <StartTime> [-|~] <EndTime>
    const slotRegex = /(월|화|수|목|금)\s*(\d{1,2}:?\d{2}|\d{1,2})\s*(?:~|-|–|—)\s*(\d{1,2}:?\d{2}|\d{1,2})/g;
    const slots = [];
    let remainder = text;

    let match;
    while ((match = slotRegex.exec(text)) !== null) {
      const day = match[1];
      const startMin = parseTimeToken(match[2]);
      const endMin = parseTimeToken(match[3]);
      if (startMin !== null && endMin !== null && endMin > startMin) {
        slots.push({
          day,
          startMin,
          endMin,
          label: `${minutesToLabel(startMin)}~${minutesToLabel(endMin)}`,
        });
      }
      remainder = remainder.replace(match[0], ' ');
    }

    // Clean punctuation left over from separating slots
    remainder = remainder.replace(/[,/]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Extract optional room token like "104호", "공학관 302호", "B102호"
    let room = '';
    const roomMatch = remainder.match(/([A-Za-z가-힣0-9-]+호)\b/);
    if (roomMatch) {
      room = roomMatch[1];
      remainder = remainder.replace(roomMatch[0], ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      empty: false,
      name: remainder,
      slots,
      room,
    };
  }

  function updateQuickPreview() {
    const raw = els.quickInput.value.trim();
    if (!raw) {
      els.quickRawText.textContent = '월 1100 ~ 1300';
      els.quickRawText.classList.add('is-placeholder');
      els.quickChips.innerHTML = `
        <span class="tt-quick-chip tt-quick-chip--sample">
          <span class="tt-cal-mini" aria-hidden="true">17</span>
          <span>월 11:00 ~ 13:00</span>
        </span>
      `;
      return;
    }

    els.quickRawText.textContent = raw;
    els.quickRawText.classList.remove('is-placeholder');

    const parsed = parseQuickInput(raw);
    const chipsHtml = [];

    if (parsed.name) {
      chipsHtml.push(`<span class="tt-quick-chip tt-quick-chip--name">${escapeHtml(parsed.name)}</span>`);
    }
    for (const s of parsed.slots) {
      chipsHtml.push(`
        <span class="tt-quick-chip">
          <span class="tt-cal-mini" aria-hidden="true">17</span>
          <span>${escapeHtml(s.day)} ${escapeHtml(s.label.replace('~', ' ~ '))}</span>
        </span>
      `);
    }
    if (parsed.room) {
      chipsHtml.push(`<span class="tt-quick-chip tt-quick-chip--name">${escapeHtml(parsed.room)}</span>`);
    }

    els.quickChips.innerHTML = chipsHtml.join('');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ========================================================================
     Semester Tabs & Duplicate-Prevention "+" Popover
     ======================================================================== */
  function getExistingStandardSemesters() {
    const all = new Set(getAllSemesters());
    const standard = new Set();
    for (const g of GRADES) {
      for (const t of TERMS) {
        const label = formatSemesterLabel(g, t);
        if (all.has(label)) standard.add(label);
      }
    }
    return standard;
  }

  function isGradeFullyUsed(grade, existingSet) {
    return TERMS.every((t) => existingSet.has(formatSemesterLabel(grade, t)));
  }

  function renderSemesterTabs() {
    const semesters = ensureActiveSemester();
    els.semesterTabs.innerHTML = '';

    for (const sem of semesters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tt-tab${sem === state.activeSemester ? ' is-active' : ''}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', sem === state.activeSemester ? 'true' : 'false');
      btn.innerHTML = `
        <span class="tt-cal-icon" aria-hidden="true">17</span>
        <span>${escapeHtml(sem)}</span>
      `;
      btn.addEventListener('click', () => {
        state.activeSemester = sem;
        saveCache();
        renderSemesterTabs();
        renderGridEvents();
      });
      els.semesterTabs.appendChild(btn);
    }

    // Rule 3: Disable "+" button when all 8 standard semesters (1~4학년 1~2학기) exist
    const existingStandard = getExistingStandardSemesters();
    const allFull = existingStandard.size >= TOTAL_STANDARD_SEMESTERS;
    els.addSemesterBtn.disabled = allFull;
    els.addSemesterBtn.title = allFull ? '모든 학기(1~4학년 1~2학기)가 이미 추가되었습니다' : '새 학기 추가';
    if (allFull) {
      closeSemesterPopover();
    }
  }

  function renderSemesterPopoverOptions() {
    const existing = getExistingStandardSemesters();

    // Ensure selectedGrade points to an available grade
    if (state.selectedGrade === null || isGradeFullyUsed(state.selectedGrade, existing)) {
      state.selectedGrade = GRADES.find((g) => !isGradeFullyUsed(g, existing)) || null;
    }

    // Render Grade buttons (Rule 2: disable grade if both 1학기 & 2학기 exist)
    els.gradeOptions.innerHTML = '';
    for (const grade of GRADES) {
      const disabled = isGradeFullyUsed(grade, existing);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tt-pill-option${state.selectedGrade === grade && !disabled ? ' is-selected' : ''}`;
      btn.textContent = `${grade}학년`;
      btn.disabled = disabled;
      btn.addEventListener('click', () => {
        state.selectedGrade = grade;
        state.selectedTerm = null; // reset term to auto-pick available one
        renderSemesterPopoverOptions();
      });
      els.gradeOptions.appendChild(btn);
    }

    // Ensure selectedTerm points to an available term for selectedGrade
    const availableTerms = state.selectedGrade
      ? TERMS.filter((t) => !existing.has(formatSemesterLabel(state.selectedGrade, t)))
      : [];

    if (state.selectedTerm === null || !availableTerms.includes(state.selectedTerm)) {
      state.selectedTerm = availableTerms[0] || null;
    }

    // Render Term buttons (Rule 1: disable term if Grade+Term already exists)
    els.termOptions.innerHTML = '';
    for (const term of TERMS) {
      const disabled =
        !state.selectedGrade || existing.has(formatSemesterLabel(state.selectedGrade, term));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tt-pill-option${state.selectedTerm === term && !disabled ? ' is-selected' : ''}`;
      btn.textContent = `${term}학기`;
      btn.disabled = disabled;
      btn.addEventListener('click', () => {
        state.selectedTerm = term;
        renderSemesterPopoverOptions();
      });
      els.termOptions.appendChild(btn);
    }

    els.confirmSemesterBtn.disabled = !(state.selectedGrade && state.selectedTerm);
  }

  function openSemesterPopover() {
    if (els.addSemesterBtn.disabled) return;
    state.selectedGrade = null;
    state.selectedTerm = null;
    renderSemesterPopoverOptions();
    els.semesterPopover.classList.remove('hidden');
    els.addSemesterBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSemesterPopover() {
    els.semesterPopover.classList.add('hidden');
    els.addSemesterBtn.setAttribute('aria-expanded', 'false');
  }

  function handleConfirmAddSemester() {
    if (!state.selectedGrade || !state.selectedTerm) return;
    const label = formatSemesterLabel(state.selectedGrade, state.selectedTerm);
    if (!state.customSemesters.includes(label)) {
      state.customSemesters.push(label);
    }
    state.activeSemester = label;
    saveCache();
    closeSemesterPopover();
    renderSemesterTabs();
    renderGridEvents();
  }

  /* ========================================================================
     Timetable Grid Skeleton & Event Rendering
     ======================================================================== */
  function buildGridSkeleton() {
    els.timeCol.innerHTML = '';
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const cell = document.createElement('div');
      cell.className = 'tt-time-cell';
      cell.textContent = `${pad2(h)}:00~${pad2(h + 1)}:00`;
      els.timeCol.appendChild(cell);
    }

    els.daysCols.innerHTML = '';
    DAYS.forEach((day) => {
      const col = document.createElement('div');
      col.className = 'tt-day-col';
      col.dataset.day = day;

      for (let h = START_HOUR; h < END_HOUR; h++) {
        const cell = document.createElement('div');
        cell.className = 'tt-day-cell';
        cell.title = `${day} ${pad2(h)}:00~${pad2(h + 1)}:00 과목 추가`;
        cell.addEventListener('click', () => {
          openCourseModal('add', {
            days: [day],
            time: `${pad2(h)}:00~${pad2(h + 1)}:00`,
            semester: state.activeSemester,
          });
        });
        col.appendChild(cell);
      }

      const eventsLayer = document.createElement('div');
      eventsLayer.className = 'tt-day-events';
      eventsLayer.dataset.dayEvents = day;
      col.appendChild(eventsLayer);

      els.daysCols.appendChild(col);
    });
  }

  function assignColorIndices(courses) {
    const colorMap = new Map();
    let nextIdx = 0;
    for (const c of courses) {
      const key = c.id || c.name;
      if (!colorMap.has(key)) {
        colorMap.set(key, nextIdx % 8);
        nextIdx += 1;
      }
    }
    return colorMap;
  }

  function layoutDayEvents(items) {
    // Sort by startMin asc, then duration desc
    const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const groups = [];

    for (const item of sorted) {
      let placed = false;
      for (const group of groups) {
        if (item.startMin < group.maxEnd) {
          group.items.push(item);
          group.maxEnd = Math.max(group.maxEnd, item.endMin);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push({ items: [item], maxEnd: item.endMin });
      }
    }

    const laidOut = [];
    for (const group of groups) {
      const cols = [];
      for (const item of group.items) {
        let colIndex = cols.findIndex((colEnd) => colEnd <= item.startMin);
        if (colIndex === -1) {
          colIndex = cols.length;
          cols.push(item.endMin);
        } else {
          cols[colIndex] = item.endMin;
        }
        laidOut.push({ ...item, colIndex, colTotal: 0 });
      }
      const total = cols.length;
      for (let i = laidOut.length - group.items.length; i < laidOut.length; i++) {
        laidOut[i].colTotal = total;
      }
    }
    return laidOut;
  }

  function renderGridEvents() {
    const activeCourses = state.courses.filter((c) => (c.semester || '').trim() === state.activeSemester);
    const colorMap = assignColorIndices(activeCourses);

    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 46;
    const minVisible = START_HOUR * 60;
    const maxVisible = END_HOUR * 60;

    // Group slots by day
    const byDay = {};
    DAYS.forEach((d) => {
      byDay[d] = [];
    });

    for (const course of activeCourses) {
      const slots = parseCourseSlots(course);
      const colorIdx = colorMap.get(course.id || course.name) ?? 0;
      for (const slot of slots) {
        if (!byDay[slot.day]) continue;
        const clampedStart = Math.max(minVisible, Math.min(maxVisible, slot.startMin));
        const clampedEnd = Math.max(clampedStart, Math.min(maxVisible, slot.endMin));
        if (clampedEnd <= clampedStart) continue;

        byDay[slot.day].push({
          course,
          startMin: clampedStart,
          endMin: clampedEnd,
          label: slot.label,
          colorIdx,
        });
      }
    }

    for (const day of DAYS) {
      const layer = els.daysCols.querySelector(`[data-day-events="${day}"]`);
      if (!layer) continue;
      layer.innerHTML = '';

      const laidOut = layoutDayEvents(byDay[day]);
      for (const item of laidOut) {
        const topPx = ((item.startMin - minVisible) / 60) * rowHeight + 2;
        const heightPx = Math.max(24, ((item.endMin - item.startMin) / 60) * rowHeight - 4);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `tt-course-card tt-color-${item.colorIdx}`;
        card.style.top = `${topPx}px`;
        card.style.height = `${heightPx}px`;

        if (item.colTotal > 1) {
          const pct = 100 / item.colTotal;
          card.style.left = `calc(${item.colIndex * pct}% + 2px)`;
          card.style.right = 'auto';
          card.style.width = `calc(${pct}% - 4px)`;
        }

        const roomHtml = item.course.room
          ? `<div class="tt-course-room">${escapeHtml(item.course.room)}</div>`
          : '';

        card.innerHTML = `
          <div class="tt-course-title">${escapeHtml(item.course.name)}</div>
          <div class="tt-course-time">${escapeHtml(item.label)}</div>
          ${roomHtml}
        `;

        card.addEventListener('click', (e) => {
          e.stopPropagation();
          openCourseModal('edit', item.course);
        });

        layer.appendChild(card);
      }
    }
  }

  /* ========================================================================
     Add / Edit Course Modal
     ======================================================================== */
  function populateModalSemesterSelect(selectedValue) {
    const semesters = getAllSemesters();
    if (selectedValue && !semesters.includes(selectedValue)) {
      semesters.unshift(selectedValue);
    }
    els.courseSemester.innerHTML = semesters
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join('');
    els.courseSemester.value = selectedValue || state.activeSemester || semesters[0];
  }

  function setSelectedDaysInModal(days) {
    const set = new Set(Array.isArray(days) ? days : []);
    els.courseDaysGroup.querySelectorAll('.tt-day-toggle').forEach((btn) => {
      btn.classList.toggle('is-selected', set.has(btn.dataset.day));
    });
  }

  function getSelectedDaysInModal() {
    const out = [];
    els.courseDaysGroup.querySelectorAll('.tt-day-toggle.is-selected').forEach((btn) => {
      out.push(btn.dataset.day);
    });
    return out;
  }

  function showFormError(msg) {
    if (!msg) {
      els.courseFormError.classList.add('hidden');
      els.courseFormError.textContent = '';
      return;
    }
    els.courseFormError.textContent = msg;
    els.courseFormError.classList.remove('hidden');
  }

  function openCourseModal(mode, initial = {}) {
    state.modalMode = mode;
    showFormError('');

    els.modalTitle.textContent = mode === 'edit' ? '과목 수정' : '과목 추가';
    els.courseId.value = initial.id || '';
    els.courseName.value = initial.name || '';
    populateModalSemesterSelect(initial.semester || state.activeSemester);
    els.courseCategory.value = initial.category || '전공선택';
    setSelectedDaysInModal(initial.days || []);
    els.courseTime.value = initial.time || '';
    els.courseRoom.value = initial.room || '';

    els.deleteCourseBtn.classList.toggle('hidden', mode !== 'edit');
    els.modalBackdrop.classList.remove('hidden');

    setTimeout(() => {
      if (!els.courseName.value) {
        els.courseName.focus();
      } else {
        els.courseTime.focus();
      }
    }, 20);
  }

  function closeCourseModal() {
    els.modalBackdrop.classList.add('hidden');
    showFormError('');
  }

  async function saveCourse(payload, mode) {
    if (IS_DEMO) {
      if (mode === 'edit') {
        const idx = state.courses.findIndex((c) => c.id === payload.id);
        if (idx !== -1) {
          state.courses[idx] = { ...state.courses[idx], ...payload };
        }
      } else {
        state.courses.push({
          ...payload,
          id: `demo-${Date.now()}`,
        });
      }
      if (payload.semester) state.activeSemester = payload.semester;
      saveCache();
      renderSemesterTabs();
      renderGridEvents();
      showBanner('데모 모드에서 시간표가 반영되었습니다.', 'info', 2200);
      return;
    }

    const method = mode === 'edit' ? 'PATCH' : 'POST';
    const res = await fetch('/api/timetable', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `요청 실패 (${res.status})`);
    }

    if (mode === 'edit' && data.course) {
      const idx = state.courses.findIndex((c) => c.id === payload.id);
      if (idx !== -1) state.courses[idx] = data.course;
    } else if (data.course) {
      state.courses.push(data.course);
    }

    if (payload.semester) state.activeSemester = payload.semester;
    saveCache();
    renderSemesterTabs();
    renderGridEvents();
  }

  async function deleteCourse(id) {
    if (!id) return;
    if (IS_DEMO) {
      state.courses = state.courses.filter((c) => c.id !== id);
      saveCache();
      renderSemesterTabs();
      renderGridEvents();
      return;
    }

    const res = await fetch('/api/timetable', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, archived: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `삭제 실패 (${res.status})`);
    }

    state.courses = state.courses.filter((c) => c.id !== id);
    saveCache();
    renderSemesterTabs();
    renderGridEvents();
  }

  /* ========================================================================
     Network Sync (Background Refresh after Instant Cache Render)
     ======================================================================== */
  async function syncFromNotion({ silent = false } = {}) {
    if (IS_DEMO) {
      if (state.courses.length === 0) {
        state.courses = DEMO_COURSES.map((c) => ({ ...c }));
      }
      renderSemesterTabs();
      renderGridEvents();
      return;
    }

    if (state.isSyncing) return;
    state.isSyncing = true;
    els.syncBtn.classList.add('is-syncing');

    try {
      const res = await fetch('/api/timetable', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent || state.courses.length === 0) {
          showBanner(data.error || `노션 동기화 실패 (${res.status})`, 'error');
        }
        return;
      }

      if (Array.isArray(data.courses)) {
        state.courses = data.courses;
        saveCache();
        renderSemesterTabs();
        renderGridEvents();
        showBanner('');
      }
    } catch (err) {
      if (!silent || state.courses.length === 0) {
        showBanner(`네트워크 오류: ${err.message}`, 'error');
      }
    } finally {
      state.isSyncing = false;
      els.syncBtn.classList.remove('is-syncing');
    }
  }

  /* ========================================================================
     Event Listeners
     ======================================================================== */
  function bindEvents() {
    // Semester "+" popover
    els.addSemesterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (els.semesterPopover.classList.contains('hidden')) {
        openSemesterPopover();
      } else {
        closeSemesterPopover();
      }
    });

    els.cancelSemesterBtn.addEventListener('click', closeSemesterPopover);
    els.confirmSemesterBtn.addEventListener('click', handleConfirmAddSemester);

    document.addEventListener('click', (e) => {
      if (
        !els.semesterPopover.classList.contains('hidden') &&
        !els.semesterPopover.contains(e.target) &&
        !els.addSemesterBtn.contains(e.target)
      ) {
        closeSemesterPopover();
      }
    });

    // Header actions
    els.syncBtn.addEventListener('click', () => syncFromNotion({ silent: false }));
    els.addCourseBtn.addEventListener('click', () => {
      openCourseModal('add', { semester: state.activeSemester });
    });

    // Modal controls
    els.closeCourseModal.addEventListener('click', closeCourseModal);
    els.cancelCourseBtn.addEventListener('click', closeCourseModal);
    els.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === els.modalBackdrop) closeCourseModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSemesterPopover();
        closeCourseModal();
      }
    });

    els.courseDaysGroup.querySelectorAll('.tt-day-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('is-selected');
      });
    });

    els.courseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showFormError('');

      const name = els.courseName.value.trim();
      const days = getSelectedDaysInModal();
      const time = els.courseTime.value.trim();
      const semester = els.courseSemester.value.trim() || state.activeSemester;
      const category = els.courseCategory.value;
      const room = els.courseRoom.value.trim();

      if (!name) {
        showFormError('과목명을 입력해 주세요.');
        return;
      }
      if (days.length === 0) {
        showFormError('요일을 하나 이상 선택해 주세요.');
        return;
      }
      const testSlots = parseCourseSlots({ days, time });
      if (testSlots.length === 0) {
        showFormError('시간 형식을 확인해 주세요. (예: 13:00-15:00 또는 09:00~11:00 / 09:00~10:00)');
        return;
      }

      els.saveCourseBtn.disabled = true;
      els.saveCourseBtn.textContent = '저장 중...';

      try {
        await saveCourse(
          {
            id: els.courseId.value || undefined,
            name,
            days,
            time,
            semester,
            category,
            room,
          },
          state.modalMode
        );
        closeCourseModal();
      } catch (err) {
        showFormError(err.message);
      } finally {
        els.saveCourseBtn.disabled = false;
        els.saveCourseBtn.textContent = '저장';
      }
    });

    els.deleteCourseBtn.addEventListener('click', async () => {
      const id = els.courseId.value;
      if (!id) return;
      els.deleteCourseBtn.disabled = true;
      try {
        await deleteCourse(id);
        closeCourseModal();
      } catch (err) {
        showFormError(err.message);
      } finally {
        els.deleteCourseBtn.disabled = false;
      }
    });

    // Bottom Quick Input Bar
    els.quickInput.addEventListener('input', updateQuickPreview);
    els.quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = els.quickInput.value.trim();
      if (!raw) return;

      const parsed = parseQuickInput(raw);
      if (parsed.slots.length === 0) {
        showBanner('요일과 시간을 인식할 수 없습니다. 예: 알고리즘 월 1100-1300', 'warn', 3200);
        return;
      }

      const days = parsed.slots.map((s) => s.day);
      const uniqueLabels = new Set(parsed.slots.map((s) => s.label));
      const timeStr =
        uniqueLabels.size === 1
          ? parsed.slots[0].label
          : parsed.slots.map((s) => s.label).join(' / ');

      // If user only typed time (e.g. "월 1100-1300"), open modal pre-filled
      if (!parsed.name) {
        openCourseModal('add', {
          days,
          time: timeStr,
          room: parsed.room,
          semester: state.activeSemester,
        });
        return;
      }

      // Otherwise add immediately to current semester & Notion DB
      try {
        await saveCourse(
          {
            name: parsed.name,
            days,
            time: timeStr,
            semester: state.activeSemester,
            category: '전공선택',
            room: parsed.room,
          },
          'add'
        );
        els.quickInput.value = '';
        updateQuickPreview();
      } catch (err) {
        showBanner(`과목 추가 실패: ${err.message}`, 'error', 4000);
      }
    });

    window.addEventListener('resize', () => {
      renderGridEvents();
    });
  }

  /* ========================================================================
     Init: Instant Render from localStorage -> Background Notion Refresh
     ======================================================================== */
  function init() {
    buildGridSkeleton();
    bindEvents();
    updateQuickPreview();

    if (IS_DEMO) {
      state.courses = DEMO_COURSES.map((c) => ({ ...c }));
      state.activeSemester = '2학년 2학기';
      renderSemesterTabs();
      renderGridEvents();
      return;
    }

    // 1. Instant 0.01s render from localStorage cache
    const cached = loadJson(CACHE_KEY, null);
    if (cached && Array.isArray(cached.courses) && cached.courses.length > 0) {
      state.courses = cached.courses;
      renderSemesterTabs();
      renderGridEvents();
    } else {
      renderSemesterTabs();
      renderGridEvents();
    }

    // 2. Background refresh from /api/timetable
    syncFromNotion({ silent: Boolean(cached && cached.courses && cached.courses.length > 0) });
  }

  init();
})();
