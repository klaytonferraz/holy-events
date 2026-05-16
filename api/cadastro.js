// Endpoint público para auto-cadastro de operadores.
// Não requer autenticação. Status sempre 'Pendente'.
const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    nome, produto, poc, tel, insta, tipo,
    cidades, carga, volt, dim, obs, capacidade, segmentos,
  } = req.body || {};

  if (!nome || !nome.trim())
    return res.status(400).json({ error: 'Nome é obrigatório.' });

  // Gera ID numérico único baseado em epoch seconds
  const id = Math.floor(Date.now() / 1000);

  const { data, error } = await supabase.from('operadores').insert({
    id,
    nome:      nome.trim(),
    produto:   produto || '',
    poc:       poc    || '',
    tel:       tel    || '',
    insta:     insta  || '',
    tipo:      tipo   || 'Truck',
    status:    'Pendente',   // sempre Pendente no auto-cadastro
    cidades:   cidades || '',
    carga:     carga  || '',
    volt:      volt   || '',
    dim:       dim    || '',
    obs:       obs    || '',
    capacidade: parseInt(capacidade) || 1,
    segmentos: segmentos || [],
    is_holy:   false,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ ok: true, id: data.id });
};
