const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Body parse robusto: Vercel auto-parseia JSON, mas garante fallback
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const username = (body.username || '').trim();
  const password = (body.password || '');

  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha obrigatórios.' });

  const { data, error } = await supabase
    .from('usuarios')
    .select('username, name, password')
    .eq('username', username)
    .single();

  if (error || !data || data.password !== password)
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  return res.status(200).json({ ok: true, name: data.name || username });
};
