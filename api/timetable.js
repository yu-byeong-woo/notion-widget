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

function getRichText(prop) {
  if (!prop) return '';
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((t) => t.plain_text || '').join('').trim();
  }
  if (prop.type === 'title' && Array.isArray(prop.title)) {
    return prop.title.map((t) => t.plain_text || '').join('').trim();
  }
  if (prop.type === 'select' && prop.select?.name) {
    return String(prop.select.name).trim();
  }
  if (prop.type === 'formula' && prop.formula?.type === 'string' && prop.formula.string) {
    return String(prop.formula.string).trim();
  }
  return '';
}

function getMultiSelect(prop) {
  if (!prop) return [];
  if (prop.type === 'multi_select' && Array.isArray(prop.multi_select)) {
    return prop.multi_select.map((item) => String(item.name || '').trim()).filter(Boolean);
  }
  if (prop.type === 'select' && prop.select?.name) {
    return String(prop.select.name)
      .split(/[,/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    const raw = prop.rich_text.map((t) => t.plain_text || '').join('').trim();
    return raw
      .split(/[,/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function getSelectName(prop) {
  if (!prop) return '';
  if (prop.type === 'select' && prop.select?.name) {
    return String(prop.select.name).trim();
  }
  if (prop.type === 'status' && prop.status?.name) {
    return String(prop.status.name).trim();
  }
  if (prop.type === 'multi_select' && Array.isArray(prop.multi_select) && prop.multi_select.length > 0) {
    return String(prop.multi_select[0].name || '').trim();
  }
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((t) => t.plain_text || '').join('').trim();
  }
  return '';
}

function getNumberValue(prop) {
  if (!prop) return null;
  if (prop.type === 'number' && typeof prop.number === 'number') {
    return prop.number;
  }
  if (prop.type === 'select' && prop.select?.name) {
    const parsed = parseFloat(String(prop.select.name).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDayToken(raw) {
  const token = String(raw || '').trim().replace(/요일$/, '');
  const map = {
    월: '월',
    화: '화',
    수: '수',
    목: '목',
    금: '금',
    Mon: '월',
    Tue: '화',
    Wed: '수',
    Thu: '목',
    Fri: '금',
  };
  return map[token] || '';
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

// Inspect database schema so POST/PATCH writes to the exact property names & types present in the user's Notion DB
async function resolveSchema(apiKey, databaseId) {
  const db = await notionFetch(apiKey, `/databases/${databaseId}`, 'GET');
  const props = db.properties || {};

  const findProp = (candidates, expectedTypes = []) => {
    for (const name of candidates) {
      if (props[name] && (expectedTypes.length === 0 || expectedTypes.includes(props[name].type))) {
        return { name, type: props[name].type };
      }
    }
    return null;
  };

  let titleProp = findProp(['이름', '과목명', 'Name', 'Title'], ['title']);
  if (!titleProp) {
    const entry = Object.entries(props).find(([, v]) => v && v.type === 'title');
    if (entry) titleProp = { name: entry[0], type: 'title' };
  }

  return {
    title: titleProp || { name: '이름', type: 'title' },
    days: findProp(['요일', 'Days'], ['multi_select', 'select', 'rich_text']),
    time: findProp(['시간', '강의시간', 'Time'], ['rich_text', 'select']),
    semester: findProp(['학기', '이수 학기', 'Semester'], ['select', 'rich_text', 'multi_select']),
    category: findProp(['이수구분', '구분', 'Category'], ['select', 'rich_text']),
    room: findProp(['강의실', '장소', 'Room'], ['rich_text', 'select']),
    credits: findProp(['학점', 'Credits'], ['number', 'select']),
    status: findProp(['수강상태', '상태', 'Status'], ['select', 'status']),
  };
}

function buildWriteProperties(schema, payload, isUpdate = false) {
  const properties = {};

  if (payload.name !== undefined && schema.title) {
    const name = String(payload.name || '').trim();
    if (name) {
      properties[schema.title.name] = {
        title: [{ text: { content: name } }],
      };
    }
  }

  if (payload.days !== undefined && schema.days) {
    const normalizedDays = (Array.isArray(payload.days) ? payload.days : [])
      .map(normalizeDayToken)
      .filter(Boolean);
    if (schema.days.type === 'multi_select') {
      properties[schema.days.name] = {
        multi_select: normalizedDays.map((d) => ({ name: d })),
      };
    } else if (schema.days.type === 'rich_text') {
      properties[schema.days.name] = {
        rich_text: normalizedDays.length ? [{ text: { content: normalizedDays.join(', ') } }] : [],
      };
    } else if (schema.days.type === 'select' && normalizedDays[0]) {
      properties[schema.days.name] = { select: { name: normalizedDays[0] } };
    }
  }

  if (payload.time !== undefined && schema.time) {
    const timeStr = String(payload.time || '').trim();
    if (schema.time.type === 'rich_text') {
      properties[schema.time.name] = {
        rich_text: timeStr ? [{ text: { content: timeStr } }] : [],
      };
    } else if (schema.time.type === 'select' && timeStr) {
      properties[schema.time.name] = { select: { name: timeStr } };
    }
  }

  if (payload.semester !== undefined && schema.semester) {
    const semStr = String(payload.semester || '').trim();
    if (schema.semester.type === 'select') {
      properties[schema.semester.name] = semStr ? { select: { name: semStr } } : { select: null };
    } else if (schema.semester.type === 'rich_text') {
      properties[schema.semester.name] = {
        rich_text: semStr ? [{ text: { content: semStr } }] : [],
      };
    } else if (schema.semester.type === 'multi_select') {
      properties[schema.semester.name] = {
        multi_select: semStr ? [{ name: semStr }] : [],
      };
    }
  }

  if (payload.category !== undefined && schema.category) {
    const catStr = String(payload.category || '').trim();
    if (schema.category.type === 'select') {
      properties[schema.category.name] = catStr ? { select: { name: catStr } } : { select: null };
    } else if (schema.category.type === 'rich_text') {
      properties[schema.category.name] = {
        rich_text: catStr ? [{ text: { content: catStr } }] : [],
      };
    }
  }

  if (payload.room !== undefined && schema.room) {
    const roomStr = String(payload.room || '').trim();
    if (schema.room.type === 'rich_text') {
      properties[schema.room.name] = {
        rich_text: roomStr ? [{ text: { content: roomStr } }] : [],
      };
    } else if (schema.room.type === 'select') {
      properties[schema.room.name] = roomStr ? { select: { name: roomStr } } : { select: null };
    }
  }

  if (!isUpdate && schema.status && payload.status) {
    const statusStr = String(payload.status).trim();
    if (schema.status.type === 'status') {
      properties[schema.status.name] = { status: { name: statusStr } };
    } else if (schema.status.type === 'select') {
      properties[schema.status.name] = { select: { name: statusStr } };
    }
  }

  if (payload.credits !== undefined && payload.credits !== null && payload.credits !== '' && schema.credits) {
    const num = Number(payload.credits);
    if (Number.isFinite(num) && num > 0) {
      if (schema.credits.type === 'number') {
        properties[schema.credits.name] = { number: num };
      } else if (schema.credits.type === 'select') {
        properties[schema.credits.name] = { select: { name: String(num) } };
      }
    }
  }

  return properties;
}

function mapPageToCourse(page) {
  const props = page.properties || {};
  const name = getTitleText(props['이름'] || props['과목명'] || props['Name'], props);
  const rawDays = getMultiSelect(props['요일'] || props['Days']);
  const days = rawDays.map(normalizeDayToken).filter(Boolean);
  const time = getRichText(props['시간'] || props['강의시간'] || props['Time']);
  const semester = getSelectName(props['학기'] || props['이수 학기'] || props['Semester']);
  const category = getSelectName(props['이수구분'] || props['구분'] || props['Category']);
  const room = getRichText(props['강의실'] || props['장소'] || props['Room']);
  const credits = getNumberValue(props['학점'] || props['Credits']);
  const status = getSelectName(props['수강상태'] || props['상태'] || props['Status']);

  return {
    id: page.id,
    name,
    days,
    time,
    semester,
    category,
    room,
    credits,
    status,
    url: page.url || null,
  };
}

async function handleGet(apiKey, dbId, res) {
  const pages = await queryAllPages(apiKey, dbId.formatted);
  const courses = pages
    .map(mapPageToCourse)
    .filter((c) => c.name !== '');

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    courses,
    databaseUrl: `https://www.notion.so/${dbId.clean}`,
    updatedAt: new Date().toISOString(),
  });
}

async function handlePost(req, apiKey, dbId, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: '잘못된 JSON 요청입니다.', code: 'BAD_REQUEST' });
    return;
  }

  const name = String(body.name || '').trim();
  if (!name) {
    res.status(400).json({ error: '과목명을 입력해 주세요.', code: 'MISSING_NAME' });
    return;
  }

  const schema = await resolveSchema(apiKey, dbId.formatted);
  const properties = buildWriteProperties(
    schema,
    {
      name,
      days: body.days || [],
      time: body.time || '',
      semester: body.semester || '',
      category: body.category || '전공선택',
      room: body.room || '',
      credits: body.credits,
      status: body.status || '수강중',
    },
    false
  );

  const created = await notionFetch(apiKey, '/pages', 'POST', {
    parent: { database_id: dbId.formatted },
    properties,
  });

  res.status(201).json({
    ok: true,
    course: mapPageToCourse(created),
  });
}

async function handlePatch(req, apiKey, dbId, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: '잘못된 JSON 요청입니다.', code: 'BAD_REQUEST' });
    return;
  }

  const pageId = normalizeNotionId(body.id);
  if (!pageId) {
    res.status(400).json({ error: '수정할 과목 ID가 올바르지 않습니다.', code: 'INVALID_PAGE_ID' });
    return;
  }

  if (body.archived === true) {
    await notionFetch(apiKey, `/pages/${pageId.formatted}`, 'PATCH', { archived: true });
    res.status(200).json({ ok: true, id: pageId.formatted, archived: true });
    return;
  }

  const schema = await resolveSchema(apiKey, dbId.formatted);
  const properties = buildWriteProperties(schema, body, true);

  const updated = await notionFetch(apiKey, `/pages/${pageId.formatted}`, 'PATCH', {
    properties,
  });

  res.status(200).json({
    ok: true,
    course: mapPageToCourse(updated),
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiKey = process.env.NOTION_API_KEY;
  const rawDbId = process.env.NOTION_TIMETABLE_DB_ID || process.env.NOTION_DATABASE_ID;

  if (!apiKey || !rawDbId) {
    res.status(500).json({
      error: '환경변수(NOTION_API_KEY, NOTION_TIMETABLE_DB_ID)가 설정되지 않았습니다.',
      code: 'MISSING_ENV',
    });
    return;
  }

  const dbId = normalizeNotionId(rawDbId);
  if (!dbId) {
    res.status(500).json({
      error: 'NOTION_TIMETABLE_DB_ID 형식이 올바르지 않습니다.',
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
      await handlePost(req, apiKey, dbId, res);
      return;
    }
    if (req.method === 'PATCH') {
      await handlePatch(req, apiKey, dbId, res);
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
