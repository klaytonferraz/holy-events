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

  // Log de diagnóstico (visível nos Vercel Function Logs)
  console.log('[login] env SUPABASE_URL:', process.env.SUPABASE_URL || '(VAZIO)');
  console.log('[login] env SUPABASE_SECRET_KEY present:', !!process.env.SUPABASE_SECRET_KEY);
  console.log('[login] body username:', JSON.stringify(username));
  console.log('[login] body password length:', password.length);

  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha obrigatórios.' });

  const { data, error } = await supabase
    .from('usuarios')
    .select('username, name, password')
    .eq('username', username)
    .single();

  console.log('[login] supabase error:', error ? error.message : 'null');
  console.log('[login] supabase data found:', !!data);
  if (data) {
    console.log('[login] stored password length:', (data.password || '').length);
    console.log('[login] passwords match:', data.password === password);
  }

  if (error) {
    // PGRST116 = "no rows returned" pelo .single() — usuário não existe
    const notFound = error.code === 'PGRST116';
    console.log('[login] error code:', error.code, 'notFound:', notFound);
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  if (!data) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  if (data.password !== password) {
    console.log('[login] password mismatch');
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  return res.status(200).json({ ok: true, name: data.name || username });
};
