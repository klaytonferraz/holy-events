// POST /api/migrar
// Recebe o objeto completo do localStorage e popula o banco.
// Executado UMA única vez. Usa upsert para ser idempotente.
const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = req.body;
  const log = [];

  try {
    // ── 1. Config ──────────────────────────────────────────────
    if (db.config) {
      const { error } = await supabase.from('config').update({
        alert_days: db.config.alertDays,
        popup:      db.config.popup,
        auto_holy:  db.config.autoHoly,
        trash_days: db.config.trashDays,
      }).eq('id', 1);
      if (error) throw new Error('config: ' + error.message);
      log.push('config: OK');
    }

    // ── 2. Usuários ────────────────────────────────────────────
    if (db.users && db.users.length > 0) {
      const rows = db.users.map(u => ({ username: u.user, password: u.pass, name: u.name }));
      const { error } = await supabase.from('usuarios').upsert(rows, { onConflict: 'username' });
      if (error) throw new Error('usuarios: ' + error.message);
      log.push('usuarios: ' + rows.length + ' OK');
    }

    // ── 3. Clientes ────────────────────────────────────────────
    if (db.clientes && db.clientes.length > 0) {
      const rows = db.clientes.map(c => ({
        id:      c.id,
        nome:    c.nome,
        contato: c.contato || '',
        tel:     c.tel    || '',
        email:   c.email  || '',
        obs:     c.obs    || '',
      }));
      const { error } = await supabase.from('clientes').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error('clientes: ' + error.message);
      log.push('clientes: ' + rows.length + ' OK');
    }

    // ── 4. Operadores + Bloqueios ──────────────────────────────
    if (db.operadores && db.operadores.length > 0) {
      const opRows = db.operadores.map(op => ({
        id:         op.id,
        nome:       op.nome,
        produto:    op.produto   || '',
        poc:        op.poc       || '',
        tel:        op.tel       || '',
        insta:      op.insta     || '',
        tipo:       op.tipo      || 'Truck',
        status:     op.status    || 'Contratado',
        cidades:    op.cidades   || '',
        carga:      op.carga     || '',
        volt:       op.volt      || '',
        dim:        op.dim       || '',
        obs:        op.obs       || '',
        capacidade: op.capacidade || 1,
        is_holy:    op.isHoly   || false,
        segmentos:  op.segmentos || [],
      }));
      const { error } = await supabase.from('operadores').upsert(opRows, { onConflict: 'id' });
      if (error) throw new Error('operadores: ' + error.message);
      log.push('operadores: ' + opRows.length + ' OK');

      const bloqueioRows = [];
      for (const op of db.operadores) {
        if (op.bloqueios && op.bloqueios.length > 0) {
          for (const d of op.bloqueios) {
            bloqueioRows.push({ operador_id: op.id, data: d });
          }
        }
      }
      if (bloqueioRows.length > 0) {
        const { error: bErr } = await supabase
          .from('operador_bloqueios')
          .upsert(bloqueioRows, { onConflict: 'operador_id,data' });
        if (bErr) throw new Error('operador_bloqueios: ' + bErr.message);
        log.push('operador_bloqueios: ' + bloqueioRows.length + ' OK');
      }
    }

    // ── 5. Eventos ─────────────────────────────────────────────
    if (db.eventos && db.eventos.length > 0) {
      for (const ev of db.eventos) {
        // Evento principal
        const evRow = {
          id:             ev.id,
          nome:           ev.nome,
          edicao:         ev.edicao         || '',
          apelido:        ev.apelido        || '',
          cliente_id:     ev.clienteId      || null,
          status:         ev.status         || 'ativo',
          inicio:         ev.inicio         || null,
          fim:            ev.fim            || null,
          horario_inicio: ev.horarioInicio  || null,
          horario_fim:    ev.horarioFim     || null,
          publico_dia:    ev.publicoDia      || 0,
          cidades:        ev.cidades        || [],
          obs:            ev.obs            || '',
          dias_semana:    ev.dias           || [],
          manually_closed: ev.manuallyClosed || false,
          deleted_at:     ev.deletedAt      || null,
        };
        const { error: evErr } = await supabase.from('eventos').upsert(evRow, { onConflict: 'id' });
        if (evErr) throw new Error('evento ' + ev.id + ': ' + evErr.message);

        // Segmentos do evento
        if (ev.segmentosConfig && ev.segmentosConfig.length > 0) {
          await supabase.from('evento_segmentos').delete().eq('evento_id', ev.id);
          const segRows = ev.segmentosConfig.map(s => ({
            evento_id:  ev.id,
            seg_id:     s.segId,
            vagas:      s.vagas     || 0,
            holy_vagas: s.holyVagas || 0,
          }));
          const { error: sErr } = await supabase.from('evento_segmentos').insert(segRows);
          if (sErr) throw new Error('evento_segmentos ' + ev.id + ': ' + sErr.message);
        }

        // Dias especiais
        if (ev.diasEspeciais && ev.diasEspeciais.length > 0) {
          await supabase.from('evento_dias_especiais').delete().eq('evento_id', ev.id);
          const dRows = ev.diasEspeciais.map(d => ({ evento_id: ev.id, data: d }));
          const { error: dErr } = await supabase.from('evento_dias_especiais').insert(dRows);
          if (dErr) throw new Error('evento_dias_especiais ' + ev.id + ': ' + dErr.message);
        }

        // Escala (slots)
        if (ev.escala && Object.keys(ev.escala).length > 0) {
          await supabase.from('escala_slots').delete().eq('evento_id', ev.id);
          const slotRows = [];
          for (const cidade of Object.keys(ev.escala)) {
            for (const data of Object.keys(ev.escala[cidade])) {
              for (const slot of ev.escala[cidade][data]) {
                // Normaliza formato legado (só id inteiro) e novo ({id, segId})
                const operador_id = typeof slot === 'object' ? slot.id   : slot;
                const seg_id      = typeof slot === 'object' ? slot.segId : null;
                if (!seg_id) continue; // slot legado sem segId — ignora
                slotRows.push({ evento_id: ev.id, cidade, data, operador_id, seg_id });
              }
            }
          }
          if (slotRows.length > 0) {
            const { error: slErr } = await supabase.from('escala_slots').insert(slotRows);
            if (slErr) throw new Error('escala_slots ' + ev.id + ': ' + slErr.message);
            log.push('escala_slots ' + ev.id + ': ' + slotRows.length + ' slots OK');
          }
        }

        // Vagas override
        if (ev.vagasOverride && Object.keys(ev.vagasOverride).length > 0) {
          await supabase.from('vagas_override').delete().eq('evento_id', ev.id);
          const voRows = [];
          for (const cidade of Object.keys(ev.vagasOverride)) {
            for (const data of Object.keys(ev.vagasOverride[cidade])) {
              for (const segId of Object.keys(ev.vagasOverride[cidade][data])) {
                voRows.push({
                  evento_id: ev.id, cidade, data, seg_id: segId,
                  vagas: ev.vagasOverride[cidade][data][segId],
                });
              }
            }
          }
          if (voRows.length > 0) {
            const { error: voErr } = await supabase.from('vagas_override').insert(voRows);
            if (voErr) throw new Error('vagas_override ' + ev.id + ': ' + voErr.message);
            log.push('vagas_override ' + ev.id + ': ' + voRows.length + ' OK');
          }
        }

        // Horário override
        if (ev.horarioOverride && Object.keys(ev.horarioOverride).length > 0) {
          await supabase.from('horario_override').delete().eq('evento_id', ev.id);
          const hoRows = [];
          for (const data of Object.keys(ev.horarioOverride)) {
            hoRows.push({
              evento_id:      ev.id,
              data,
              horario_inicio: ev.horarioOverride[data].inicio,
              horario_fim:    ev.horarioOverride[data].fim,
            });
          }
          if (hoRows.length > 0) {
            const { error: hoErr } = await supabase.from('horario_override').insert(hoRows);
            if (hoErr) throw new Error('horario_override ' + ev.id + ': ' + hoErr.message);
            log.push('horario_override ' + ev.id + ': ' + hoRows.length + ' OK');
          }
        }

        log.push('evento ' + ev.id + ' (' + ev.nome + '): OK');
      }
    }

    return res.status(200).json({ ok: true, log });
  } catch (err) {
    return res.status(500).json({ error: err.message, log });
  }
};
