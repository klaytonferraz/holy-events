const supabase = require('../_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('operadores')
      .select('*, operador_bloqueios(data)')
      .eq('id', id)
      .single();
    if (error) return res.status(404).json({ error: error.message });
    const { is_holy, operador_bloqueios, ...rest } = data;
    return res.status(200).json({
      ...rest,
      isHoly: is_holy,
      bloqueios: (operador_bloqueios || []).map(b => b.data),
    });
  }

  if (req.method === 'PUT') {
    const { bloqueios, isHoly, operador_bloqueios: _ob, ...fields } = req.body;

    const update = { ...fields };
    if (isHoly !== undefined) update.is_holy = isHoly;

    const { error } = await supabase.from('operadores').update(update).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    if (bloqueios !== undefined) {
      await supabase.from('operador_bloqueios').delete().eq('operador_id', id);
      if (bloqueios.length > 0) {
        const rows = bloqueios.map(d => ({ operador_id: parseInt(id), data: d }));
        await supabase.from('operador_bloqueios').insert(rows);
      }
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('operadores').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
