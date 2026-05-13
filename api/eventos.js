const supabase = require('./_supabase');

// Converte campos snake_case do banco para o formato do frontend
function toFrontend(ev) {
  const {
    cliente_id, horario_inicio, horario_fim, publico_dia,
    manually_closed, deleted_at, dias_semana,
    evento_segmentos, evento_dias_especiais,
    vagas_override, horario_override,
    ...rest
  } = ev;

  return {
    ...rest,
    clienteId: cliente_id,
    horarioInicio: horario_inicio,
    horarioFim: horario_fim,
    publicoDia: publico_dia,
    manuallyClosed: manually_closed,
    deletedAt: deleted_at,
    dias: dias_semana || [],
    segmentosConfig: (evento_segmentos || []).map(s => ({
      segId: s.seg_id,
      vagas: s.vagas,
      holyVagas: s.holy_vagas,
    })),
    diasEspeciais: (evento_dias_especiais || []).map(d => d.data),
    vagasOverride: buildVagasOverride(vagas_override || []),
    horarioOverride: buildHorarioOverride(horario_override || []),
  };
}

function buildVagasOverride(rows) {
  const result = {};
  for (const r of rows) {
    if (!result[r.cidade]) result[r.cidade] = {};
    if (!result[r.cidade][r.data]) result[r.cidade][r.data] = {};
    result[r.cidade][r.data][r.seg_id] = r.vagas;
  }
  return result;
}

function buildHorarioOverride(rows) {
  const result = {};
  for (const r of rows) {
    result[r.data] = { inicio: r.horario_inicio, fim: r.horario_fim };
  }
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

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
      .order('inicio', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data.map(toFrontend));
  }

  if (req.method === 'POST') {
    const {
      id, nome, edicao, apelido, status, inicio, fim, obs, cidades,
      clienteId, horarioInicio, horarioFim, publicoDia, dias,
      manuallyClosed, deletedAt, segmentosConfig, diasEspeciais,
    } = req.body;

    const { data: ev, error } = await supabase
      .from('eventos')
      .insert({
        id, nome, edicao, apelido, status, inicio, fim, obs, cidades,
        cliente_id: clienteId || null,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        publico_dia: publicoDia || 0,
        dias_semana: dias || [],
        manually_closed: manuallyClosed || false,
        deleted_at: deletedAt || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    if (segmentosConfig && segmentosConfig.length > 0) {
      const rows = segmentosConfig.map(s => ({
        evento_id: ev.id, seg_id: s.segId, vagas: s.vagas || 0, holy_vagas: s.holyVagas || 0,
      }));
      await supabase.from('evento_segmentos').insert(rows);
    }

    if (diasEspeciais && diasEspeciais.length > 0) {
      const rows = diasEspeciais.map(d => ({ evento_id: ev.id, data: d }));
      await supabase.from('evento_dias_especiais').insert(rows);
    }

    return res.status(201).json(toFrontend({
      ...ev,
      evento_segmentos: segmentosConfig ? segmentosConfig.map(s => ({ seg_id: s.segId, vagas: s.vagas, holy_vagas: s.holyVagas || 0 })) : [],
      evento_dias_especiais: (diasEspeciais || []).map(d => ({ data: d })),
      vagas_override: [],
      horario_override: [],
    }));
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
