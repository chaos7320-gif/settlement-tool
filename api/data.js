import { put, list, del, get } from '@vercel/blob';

const BLOB_PREFIX = 'settlement-dashboard-data';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('JSON 파싱 실패: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 최신 Vercel Blob은 고정 토큰(BLOB_READ_WRITE_TOKEN) 대신 BLOB_STORE_ID + 자동 OIDC 인증도 지원함
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      if (!blobs.length) return res.status(200).json(null);
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const result = await get(blobs[0].url, { access: 'private', useCache: false });
      if (!result || !result.stream) return res.status(200).json(null);
      const text = await new Response(result.stream).text();
      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      console.error('Load error:', e);
      return res.status(200).json(null);
    }
  }

  if (req.method === 'POST') {
    try {
      const data = await readBody(req);
      const payload = JSON.stringify(data);
      const { blobs: old } = await list({ prefix: BLOB_PREFIX });
      if (old.length) await del(old.map(b => b.url));
      await put(BLOB_PREFIX + '.json', payload, {
        access: 'private',
        addRandomSuffix: true,
        contentType: 'application/json',
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Save error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      if (blobs.length) await del(blobs.map(b => b.url));
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}
