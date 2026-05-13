const supabase = require('./_supabase');

function toFrontend(op) {
  const { is_holy, operador_bloqueios, ...rest } = op;
  return {
    ...rest,
    isHoly: is_holy,
    bloqueios: (operador_bloqueios || []).map(b => b.data),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('operadores')
      .select('*, operador_bloqueios(data)')
      .order('nome');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data.map(toFrontend));
  }

  if (req.method === 'POST') {
    const { bloqueios, isHoly, id, ...fields } = req.body;
    const { data, error } = await supabase
      .from('operadores')
      .insert({ id, ...fields, is_holy: isHoly || false })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    if (bloqueios && bloqueios.length > 0) {
      const rows = bloqueios.map(d => ({ operador_id: data.id, data: d }));
      await supabase.from('operador_bloqueios').insert(rows);
    }

    return res.status(201).json(toFrontend({ ...data, operador_bloqueios: [] }));
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
