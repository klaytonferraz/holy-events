const supabase = require('../_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('eventos')
      .select(`
        *,
        evento_segmentos(*),
        evento_dias_especiais(data),
        vagas_override(*),
        horario_override(*)
      `)
      .eq('id', id)
      .single();
    if (error) return res.status(404).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const {
      segmentosConfig, diasEspeciais, vagasOverride, horarioOverride,
      clienteId, horarioInicio, horarioFim, publicoDia,
      manuallyClosed, deletedAt, dias,
      escala: _esc, // escala é gerenciada por /api/escala, ignorar aqui
      ...fields
    } = req.body;

    const update = { ...fields };
    if (clienteId !== undefined)   update.cliente_id      = clienteId;
    if (horarioInicio !== undefined) update.horario_inicio = horarioInicio;
    if (horarioFim !== undefined)    update.horario_fim    = horarioFim;
    if (publicoDia !== undefined)    update.publico_dia    = publicoDia;
    if (manuallyClosed !== undefined) update.manually_closed = manuallyClosed;
    if (deletedAt !== undefined)     update.deleted_at     = deletedAt;
    if (dias !== undefined)          update.dias_semana    = dias;

    const { error } = await supabase.from('eventos').update(update).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    if (segmentosConfig !== undefined) {
      await supabase.from('evento_segmentos').delete().eq('evento_id', id);
      if (segmentosConfig.length > 0) {
        const rows = segmentosConfig.map(s => ({
          evento_id: id, seg_id: s.segId, vagas: s.vagas || 0, holy_vagas: s.holyVagas || 0,
        }));
        await supabase.from('evento_segmentos').insert(rows);
      }
    }

    if (diasEspeciais !== undefined) {
      await supabase.from('evento_dias_especiais').delete().eq('evento_id', id);
      if (diasEspeciais.length > 0) {
        const rows = diasEspeciais.map(d => ({ evento_id: id, data: d }));
        await supabase.from('evento_dias_especiais').insert(rows);
      }
    }

    if (vagasOverride !== undefined) {
      await supabase.from('vagas_override').delete().eq('evento_id', id);
      const voRows = [];
      for (const cid of Object.keys(vagasOverride || {})) {
        for (const dt of Object.keys(vagasOverride[cid] || {})) {
          for (const segId of Object.keys(vagasOverride[cid][dt] || {})) {
            voRows.push({ evento_id: id, cidade: cid, data: dt, seg_id: segId, vagas: vagasOverride[cid][dt][segId] });
          }
        }
      }
      if (voRows.length > 0) await supabase.from('vagas_override').insert(voRows);
    }

    if (horarioOverride !== undefined) {
      await supabase.from('horario_override').delete().eq('evento_id', id);
      const hoRows = [];
      for (const dt of Object.keys(horarioOverride || {})) {
        hoRows.push({ evento_id: id, data: dt, horario_inicio: horarioOverride[dt].inicio, horario_fim: horarioOverride[dt].fim });
      }
      if (hoRows.length > 0) await supabase.from('horario_override').insert(hoRows);
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('eventos').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
