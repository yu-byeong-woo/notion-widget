const { encryptPayload, decryptPayload } = require('./_crypto');

const NOTION_API_VERSION = '2022-06-28';

function getAction(req) {
  if (req.query && req.query.action) return String(req.query.action);
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.searchParams.get('action')) return u.searchParams.get('action');
    if (u.pathname.endsWith('/callback')) return 'callback';
    if (u.pathname.endsWith('/start')) return 'start';
    if (u.pathname.endsWith('/mint')) return 'mint';
  } catch {
    // ignore
  }
  return '';
}

function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'notion-credit-widget-phi.vercel.app')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
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

async function handleStart(req, res) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: 'NOTION_OAUTH_CLIENT_ID 환경변수가 설정되지 않았습니다.' });
    return;
  }
  const redirectUri = `${getBaseUrl(req)}/api/oauth/callback`;
  const authUrl =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&owner=user` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.statusCode = 302;
  res.setHeader('Location', authUrl);
  res.end();
}

async function handleCallback(req, res) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  const baseUrl = getBaseUrl(req);

  if (!clientId || !clientSecret) {
    res.statusCode = 302;
    res.setHeader('Location', `${baseUrl}/connect#error=${encodeURIComponent('서버 OAuth 환경변수가 설정되지 않았습니다.')}`);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, baseUrl);
  const errorParam = urlObj.searchParams.get('error');
  const code = urlObj.searchParams.get('code');

  if (errorParam || !code) {
    const msg = errorParam === 'access_denied' ? '노션 연결이 취소되었습니다.' : `인증 실패: ${errorParam || '코드 없음'}`;
    res.statusCode = 302;
    res.setHeader('Location', `${baseUrl}/connect#error=${encodeURIComponent(msg)}`);
    res.end();
    return;
  }

  try {
    const redirectUri = `${baseUrl}/api/oauth/callback`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.message || '노션 토큰 발급 실패');
    }

    const accessToken = tokenData.access_token;
    const workspaceName = tokenData.workspace_name || 'Notion Workspace';

    // Fetch databases the user just granted access to
    const searchRes = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'database', property: 'object' },
        page_size: 50,
      }),
    });

    const searchData = await searchRes.json().catch(() => ({}));
    const databases = Array.isArray(searchData.results)
      ? searchData.results.map((db) => ({
          id: db.id,
          title:
            (Array.isArray(db.title) ? db.title.map((t) => t.plain_text || '').join('').trim() : '') ||
            '제목 없는 데이터베이스',
          props: Object.keys(db.properties || {}),
        }))
      : [];

    const sessionToken = encryptPayload({
      t: accessToken,
      exp: Date.now() + 30 * 60 * 1000, // 30 minutes to finish picking DBs
    });

    const encodedDbs = Buffer.from(JSON.stringify(databases), 'utf8').toString('base64url');
    const hash =
      `s=${encodeURIComponent(sessionToken)}` +
      `&ws=${encodeURIComponent(workspaceName)}` +
      `&dbs=${encodeURIComponent(encodedDbs)}`;

    res.statusCode = 302;
    res.setHeader('Location', `${baseUrl}/connect#${hash}`);
    res.end();
  } catch (err) {
    res.statusCode = 302;
    res.setHeader('Location', `${baseUrl}/connect#error=${encodeURIComponent(err.message || '연동 오류')}`);
    res.end();
  }
}

async function handleMint(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: '잘못된 요청 형식입니다.' });
    return;
  }

  const session = decryptPayload(body.session);
  if (!session || !session.t || (session.exp && Date.now() > session.exp)) {
    res.status(401).json({ error: '연동 세션이 만료되었습니다. 다시 노션 연결을 진행해 주세요.' });
    return;
  }

  const timetableDbId = String(body.timetableDbId || '').trim();
  const creditsDbId = String(body.creditsDbId || '').trim();
  if (!timetableDbId && !creditsDbId) {
    res.status(400).json({ error: '최소 하나의 데이터베이스를 선택해 주세요.' });
    return;
  }

  const baseUrl = getBaseUrl(req);
  let timetableUrl = null;
  let creditsUrl = null;

  if (timetableDbId) {
    const k = encryptPayload({
      t: session.t,
      d: timetableDbId,
      c: creditsDbId || '',
    });
    timetableUrl = `${baseUrl}/timetable?k=${encodeURIComponent(k)}`;
  }

  if (creditsDbId) {
    const k = encryptPayload({
      t: session.t,
      d: creditsDbId,
      s: timetableDbId || '',
    });
    creditsUrl = `${baseUrl}/?k=${encodeURIComponent(k)}`;
  }

  res.status(200).json({
    ok: true,
    timetableUrl,
    creditsUrl,
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const action = getAction(req);
  if (action === 'start') {
    await handleStart(req, res);
    return;
  }
  if (action === 'callback') {
    await handleCallback(req, res);
    return;
  }
  if (action === 'mint') {
    await handleMint(req, res);
    return;
  }

  res.status(404).json({ error: 'Unknown OAuth action' });
};
