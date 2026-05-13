const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/escala?eventoId=ev2&cidade=São Paulo[&data=2026-05-15]
  // Retorna os slots no formato {cidade: {data: [{id, segId}]}}
  if (req.method === 'GET') {
    const { eventoId, cidade, data } = req.query;
    if (!eventoId) return res.status(400).json({ error: 'eventoId obrigatório' });

    let query = supabase
      .from('escala_slots')
      .select('cidade, data, operador_id, seg_id')
      .eq('evento_id', eventoId);

    if (cidade) query = query.eq('cidade', cidade);
    if (data)   query = query.eq('data', data);

    const { data: rows, error } = await query.order('data');
    if (error) return res.status(500).json({ error: error.message });

    // Reconstruir estrutura {cidade: {data: [{id, segId}]}}
    const escala = {};
    for (const r of rows) {
      if (!escala[r.cidade]) escala[r.cidade] = {};
      if (!escala[r.cidade][r.data]) escala[r.cidade][r.data] = [];
      escala[r.cidade][r.data].push({ id: r.operador_id, segId: r.seg_id });
    }
    return res.status(200).json(escala);
  }

  // POST /api/escala
  // Body: { eventoId, cidade, data, slots: [{id, segId}] }
  // Substitui todos os slots do dia (delete + insert)
  if (req.method === 'POST') {
    const { eventoId, cidade, data, slots } = req.body;
    if (!eventoId || !cidade || !data) {
      return res.status(400).json({ error: 'eventoId, cidade e data são obrigatórios' });
    }

    const { error: delErr } = await supabase
      .from('escala_slots')
      .delete()
      .eq('evento_id', eventoId)
      .eq('cidade', cidade)
      .eq('data', data);
    if (delErr) return res.status(500).json({ error: delErr.message });

    if (slots && slots.length > 0) {
      const rows = slots.map(s => ({
        evento_id: eventoId,
        cidade,
        data,
        operador_id: s.id,
        seg_id: s.segId,
      }));
      const { error: insErr } = await supabase.from('escala_slots').insert(rows);
      if (insErr) return res.status(500).json({ error: insErr.message });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
