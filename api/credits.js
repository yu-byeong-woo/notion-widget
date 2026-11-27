const { decryptPayload, extractWidgetKey } = require('./_crypto');

const GRADUATION_GOAL = 136;
const NOTION_API_VERSION = '2022-06-28';

function normalizeNotionId(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const uuidMatch = trimmed.match(
    /([0-9a-fA-F]{8})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{12})/
  );
  if (!uuidMatch) return null;
  const clean = uuidMatch.slice(1).join('').toLowerCase();
  const formatted = `${uuidMatch[1]}-${uuidMatch[2]}-${uuidMatch[3]}-${uuidMatch[4]}-${uuidMatch[5]}`.toLowerCase();
  return { clean, formatted };
}

function getTitleText(prop, allProps) {
  let target = prop;
  if (!target || target.type !== 'title') {
    target = Object.values(allProps || {}).find((p) => p && p.type === 'title');
  }
  if (!target || !Array.isArray(target.title)) return '';
  return target.title.map((t) => t.plain_text || '').join('').trim();
}

function getNumberValue(prop) {
  if (!prop) return 0;
  if (prop.type === 'number' && typeof prop.number === 'number') {
    return prop.number;
  }
  if (prop.type === 'select' && prop.select?.name) {
    const parsed = parseFloat(String(prop.select.name).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (prop.type === 'status' && prop.status?.name) {
    const parsed = parseFloat(String(prop.status.name).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (prop.type === 'formula' && prop.formula?.type === 'number' && typeof prop.formula.number === 'number') {
    return prop.formula.number;
  }
  return 0;
}

function getSelectOrStatus(prop) {
  if (!prop) return { name: '', color: 'default' };
  if (prop.type === 'select' && prop.select) {
    return { name: (prop.select.name || '').trim(), color: prop.select.color || 'default' };
  }
  if (prop.type === 'status' && prop.status) {
    return { name: (prop.status.name || '').trim(), color: prop.status.color || 'default' };
  }
  if (prop.type === 'multi_select' && Array.isArray(prop.multi_select) && prop.multi_select.length > 0) {
    return { name: (prop.multi_select[0].name || '').trim(), color: prop.multi_select[0].color || 'default' };
  }
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    return { name: prop.rich_text.map((t) => t.plain_text || '').join('').trim(), color: 'default' };
  }
  return { name: '', color: 'default' };
}

function normalizeStatusKey(statusName) {
  const compact = String(statusName || '').replace(/\s+/g, '');
  if (compact === '수강완료') return '수강완료';
  if (compact === '수강중') return '수강중';
  return statusName || '';
}

function normalizeCategoryKey(categoryName) {
  const compact = String(categoryName || '').replace(/\s+/g, '');
  if (compact === '기본전공' || compact === '전공필수') return '기본전공';
  if (compact === '선택전공' || compact === '전공선택') return '선택전공';
  if (compact === '교양필수') return '교양필수';
  if (compact === '교양선택') return '교양선택';
  if (compact === '교양') return '교양';
  if (compact === '일반선택' || compact === '일반') return '일반선택';
  return categoryName || '';
}

async function notionFetch(apiKey, path, method = 'GET', bodyObj = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
    },
  };
  if (bodyObj) {
    options.body = JSON.stringify(bodyObj);
  }

  const response = await fetch(`https://api.notion.com/v1${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore parse error
  }

  if (!response.ok) {
    const err = new Error(json?.message || `Notion API Error (${response.status})`);
    err.status = response.status;
    err.code = json?.code || 'NOTION_API_ERROR';
    throw err;
  }

  return json;
}

async function queryAllPages(apiKey, databaseId) {
  const pages = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const data = await notionFetch(apiKey, `/databases/${databaseId}/query`, 'POST', body);
    if (Array.isArray(data.results)) {
      pages.push(...data.results);
    }
    hasMore = Boolean(data.has_more && data.next_cursor);
    startCursor = data.next_cursor;
  }

  return pages;
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleGet(apiKey, dbId, res) {
  const pages = await queryAllPages(apiKey, dbId.formatted);

  const courses = pages
    .map((page) => {
      const props = page.properties || {};
      const name = getTitleText(props['과목명'], props);
      const credits = getNumberValue(props['학점']);
      const statusObj = getSelectOrStatus(props['상태']);
      const categoryObj = getSelectOrStatus(props['이수구분'] || props['구분']);
      const semesterObj = getSelectOrStatus(props['학기'] || props['이수 학기']);

      const status = normalizeStatusKey(statusObj.name);
      const category = normalizeCategoryKey(categoryObj.name);
      const iconEmoji = page.icon?.type === 'emoji' ? page.icon.emoji : null;

      return {
        id: page.id,
        name,
        credits,
        status,
        statusColor: statusObj.color,
        category,
        categoryColor: categoryObj.color,
        semester: semesterObj.name,
        semesterColor: semesterObj.color,
        icon: iconEmoji,
        url: page.url || null,
      };
    })
    .filter((course) => course.name !== '' && !(course.credits === 0 && course.name.includes('졸업 요건')));

  let completedCredits = 0;
  let inProgressCredits = 0;

  for (const course of courses) {
    if (course.status === '수강완료') {
      completedCredits += course.credits;
    } else if (course.status === '수강중') {
      inProgressCredits += course.credits;
    }
  }

  completedCredits = Math.round(completedCredits * 10) / 10;
  inProgressCredits = Math.round(inProgressCredits * 10) / 10;
  const remainingCredits = Math.max(0, Math.round((GRADUATION_GOAL - completedCredits) * 10) / 10);
  const completionRate = Math.min(100, Math.round((completedCredits / GRADUATION_GOAL) * 1000) / 10);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    summary: {
      goalCredits: GRADUATION_GOAL,
      completedCredits,
      inProgressCredits,
      remainingCredits,
      completionRate,
    },
    courses,
    databaseUrl: `https://www.notion.so/${dbId.clean}`,
    updatedAt: new Date().toISOString(),
  });
}

async function handlePost(req, apiKey, dbId, subjectDbRaw, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: '잘못된 JSON 요청입니다.', code: 'BAD_REQUEST' });
    return;
  }

  const name = String(body.name || '').trim();
  const semester = String(body.semester || '').trim();
  const category = String(body.category || '').trim();
  const status = normalizeStatusKey(body.status || '수강중');
  const creditsNum = Number(body.credits);
  const creditsStr = Number.isFinite(creditsNum) && creditsNum > 0 ? String(creditsNum) : '3';
  const linkToSubject = body.linkToSubject !== false;

  if (!name) {
    res.status(400).json({ error: '과목명을 입력해 주세요.', code: 'MISSING_NAME' });
    return;
  }

  let subjectPageId = null;
  let subjectWarning = null;

  if (linkToSubject) {
    const subjectDb = normalizeNotionId(subjectDbRaw);
    if (subjectDb) {
      const subjectProps = {
        이름: { title: [{ text: { content: name } }] },
        학점: { select: { name: creditsStr } },
        '활성 상태': { select: { name: status === '수강중' ? '활성' : '비활성' } },
      };
      if (semester) subjectProps['이수 학기'] = { select: { name: semester } };
      if (category) subjectProps['구분'] = { select: { name: category } };
      if (Array.isArray(body.days) && body.days.length > 0) {
        subjectProps['요일'] = { multi_select: body.days.map((d) => ({ name: d })) };
      }
      if (body.time && String(body.time).trim()) {
        subjectProps['시간'] = { rich_text: [{ text: { content: String(body.time).trim() } }] };
      }
      if (body.room && String(body.room).trim()) {
        subjectProps['강의실'] = { rich_text: [{ text: { content: String(body.room).trim() } }] };
      }
      if (body.professor && String(body.professor).trim()) {
        subjectProps['교수님'] = { rich_text: [{ text: { content: String(body.professor).trim() } }] };
      }

      try {
        const createdSubject = await notionFetch(apiKey, '/pages', 'POST', {
          parent: { database_id: subjectDb.formatted },
          properties: subjectProps,
        });
        subjectPageId = createdSubject?.id || null;
      } catch (err) {
        // Non-fatal: still create in 이수 과목 DB and inform user
        subjectWarning = `시간표/강의 노트(Subject DB) 연동 건너뜀: ${err.message}`;
      }
    }
  }

  const courseProps = {
    과목명: { title: [{ text: { content: name } }] },
    학점: { select: { name: creditsStr } },
    상태: { status: { name: status || '수강중' } },
  };
  if (semester) courseProps['이수 학기'] = { select: { name: semester } };
  if (category) courseProps['구분'] = { select: { name: category } };
  if (subjectPageId) {
    courseProps['강의 노트'] = { relation: [{ id: subjectPageId }] };
  }

  const createdCourse = await notionFetch(apiKey, '/pages', 'POST', {
    parent: { database_id: dbId.formatted },
    properties: courseProps,
  });

  res.status(201).json({
    ok: true,
    courseId: createdCourse?.id || null,
    subjectId: subjectPageId,
    subjectLinked: Boolean(subjectPageId),
    subjectWarning,
  });
}

async function handleDelete(req, apiKey, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }

  let rawId = body?.id || (req.query && req.query.id) || '';
  if (!rawId) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      rawId = urlObj.searchParams.get('id') || '';
    } catch {
      // ignore URL parse error
    }
  }

  const courseId = normalizeNotionId(rawId);
  if (!courseId) {
    res.status(400).json({ error: '삭제할 과목 ID가 올바르지 않습니다.', code: 'INVALID_COURSE_ID' });
    return;
  }

  // 1. Inspect linked relation pages (e.g. '강의 노트' -> Subject DB) before archiving
  const linkedIds = new Set();
  try {
    const page = await notionFetch(apiKey, `/pages/${courseId.formatted}`, 'GET');
    const props = page?.properties || {};
    const primaryRel = props['강의 노트'];
    const relationProps = primaryRel && primaryRel.type === 'relation'
      ? [primaryRel]
      : Object.values(props).filter((p) => p && p.type === 'relation');

    for (const relProp of relationProps) {
      if (Array.isArray(relProp.relation)) {
        for (const item of relProp.relation) {
          if (item && item.id) linkedIds.add(item.id);
        }
      }
    }
  } catch {
    // Non-fatal: proceed to archive the course page itself
  }

  // 2. Archive linked Subject DB pages first
  let deletedLinkedCount = 0;
  const warnings = [];
  for (const relId of linkedIds) {
    try {
      await notionFetch(apiKey, `/pages/${relId}`, 'PATCH', { archived: true });
      deletedLinkedCount += 1;
    } catch (err) {
      warnings.push(`연결된 과목 페이지 삭제 건너뜀: ${err.message}`);
    }
  }

  // 3. Archive the course page itself
  await notionFetch(apiKey, `/pages/${courseId.formatted}`, 'PATCH', { archived: true });

  res.status(200).json({
    ok: true,
    deletedId: courseId.formatted,
    deletedLinkedCount,
    warning: warnings.length > 0 ? warnings.join(' / ') : null,
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const widgetKey = extractWidgetKey(req);
  if (!widgetKey) {
    res.status(401).json({
      error: '노션 연동이 필요합니다. /connect 에서 전용 임베드 링크를 발급받아 주세요.',
      code: 'WIDGET_KEY_REQUIRED',
    });
    return;
  }

  const decoded = decryptPayload(widgetKey);
  if (!decoded || !decoded.t || !decoded.d) {
    res.status(401).json({
      error: '유효하지 않은 위젯 링크입니다. /connect 에서 다시 연동해 주세요.',
      code: 'INVALID_WIDGET_KEY',
    });
    return;
  }

  const apiKey = decoded.t;
  const rawDbId = decoded.d;
  const subjectDbRaw = decoded.s || '';

  if (!apiKey || !rawDbId) {
    res.status(500).json({
      error: '환경변수(NOTION_API_KEY, NOTION_DATABASE_ID)가 설정되지 않았습니다.',
      code: 'MISSING_ENV',
    });
    return;
  }

  const dbId = normalizeNotionId(rawDbId);
  if (!dbId) {
    res.status(500).json({
      error: 'NOTION_DATABASE_ID 형식이 올바르지 않습니다.',
      code: 'INVALID_DB_ID',
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      await handleGet(apiKey, dbId, res);
      return;
    }
    if (req.method === 'POST') {
      await handlePost(req, apiKey, dbId, subjectDbRaw, res);
      return;
    }
    if (req.method === 'DELETE') {
      await handleDelete(req, apiKey, res);
      return;
    }
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    const statusCode = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(statusCode).json({
      error: error.message || '노션 요청 처리 중 오류가 발생했습니다.',
      code: error.code || 'INTERNAL_ERROR',
    });
  }
};
