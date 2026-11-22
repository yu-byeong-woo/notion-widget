const GRADUATION_GOAL = 136;
const NOTION_API_VERSION = '2022-06-28';

/**
 * Extracts a 32-char hex Notion ID from a raw ID, UUID, or full Notion URL.
 */
function normalizeNotionId(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  // Match 32 hex chars (with or without hyphens)
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
  if (compact === '전공필수') return '전공필수';
  if (compact === '전공선택') return '전공선택';
  if (compact === '교양') return '교양';
  return categoryName || '';
}

async function queryAllPages(apiKey, databaseId) {
  const pages = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson = null;
      try {
        errJson = JSON.parse(errText);
      } catch {
        // ignore parse failure
      }
      const err = new Error(errJson?.message || `Notion API Error (${response.status})`);
      err.status = response.status;
      err.code = errJson?.code || 'NOTION_API_ERROR';
      throw err;
    }

    const data = await response.json();
    if (Array.isArray(data.results)) {
      pages.push(...data.results);
    }
    hasMore = Boolean(data.has_more && data.next_cursor);
    startCursor = data.next_cursor;
  }

  return pages;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.NOTION_API_KEY;
  const rawDbId = process.env.NOTION_DATABASE_ID;

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
      .filter((course) => course.name !== '');

    let completedCredits = 0;
    let inProgressCredits = 0;

    for (const course of courses) {
      if (course.status === '수강완료') {
        completedCredits += course.credits;
      } else if (course.status === '수강중') {
        inProgressCredits += course.credits;
      }
    }

    // Round to avoid floating point artifacts (e.g. 0.5 credits)
    completedCredits = Math.round(completedCredits * 10) / 10;
    inProgressCredits = Math.round(inProgressCredits * 10) / 10;
    const remainingCredits = Math.max(0, Math.round((GRADUATION_GOAL - completedCredits) * 10) / 10);
    const completionRate = Math.min(100, Math.round((completedCredits / GRADUATION_GOAL) * 1000) / 10);

    // Keep responses snappy yet fresh for Notion embeds
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
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
  } catch (error) {
    const statusCode = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(statusCode).json({
      error: error.message || '노션 데이터를 불러오는 중 오류가 발생했습니다.',
      code: error.code || 'INTERNAL_ERROR',
    });
  }
};
