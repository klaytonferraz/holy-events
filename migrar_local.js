// Script de migração local — roda UMA vez para popular o Supabase.
// Uso: node --env-file=.env migrar_local.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const db = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'dados_localstorage.json'), 'utf8')
);

async function migrar() {
  // ── 1. Config ──────────────────────────────────────────────
  {
    const { error } = await supabase.from('config').update({
      alert_days: db.config.alertDays,
      popup:      db.config.popup,
      auto_holy:  db.config.autoHoly,
      trash_days: db.config.trashDays,
    }).eq('id', 1);
    if (error) throw new Error('config: ' + error.message);
    console.log('✓ config');
  }

  // ── 2. Usuários ────────────────────────────────────────────
  {
    const rows = db.users.map(u => ({ username: u.user, password: u.pass, name: u.name }));
    const { error } = await supabase.from('usuarios').upsert(rows, { onConflict: 'username' });
    if (error) throw new Error('usuarios: ' + error.message);
    console.log('✓ usuarios: ' + rows.length);
  }

  // ── 3. Clientes ────────────────────────────────────────────
  {
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
    console.log('✓ clientes: ' + rows.length);
  }

  // ── 4. Operadores ──────────────────────────────────────────
  {
    const rows = db.operadores.map(op => ({
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
    const { error } = await supabase.from('operadores').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error('operadores: ' + error.message);
    console.log('✓ operadores: ' + rows.length);

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
      console.log('✓ operador_bloqueios: ' + bloqueioRows.length);
    }
  }

  // ── 5. Eventos ─────────────────────────────────────────────
  for (const ev of db.eventos) {
    // Evento principal
    {
      const { error } = await supabase.from('eventos').upsert({
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
      }, { onConflict: 'id' });
      if (error) throw new Error('evento ' + ev.id + ': ' + error.message);
    }

    // Segmentos do evento
    if (ev.segmentosConfig && ev.segmentosConfig.length > 0) {
      await supabase.from('evento_segmentos').delete().eq('evento_id', ev.id);
      const rows = ev.segmentosConfig.map(s => ({
        evento_id:  ev.id,
        seg_id:     s.segId,
        vagas:      s.vagas     || 0,
        holy_vagas: s.holyVagas || 0,
      }));
      const { error } = await supabase.from('evento_segmentos').insert(rows);
      if (error) throw new Error('evento_segmentos ' + ev.id + ': ' + error.message);
    }

    // Dias especiais
    if (ev.diasEspeciais && ev.diasEspeciais.length > 0) {
      await supabase.from('evento_dias_especiais').delete().eq('evento_id', ev.id);
      const rows = ev.diasEspeciais.map(d => ({ evento_id: ev.id, data: d }));
      const { error } = await supabase.from('evento_dias_especiais').insert(rows);
      if (error) throw new Error('evento_dias_especiais ' + ev.id + ': ' + error.message);
    }

    // Escala (slots)
    if (ev.escala && Object.keys(ev.escala).length > 0) {
      await supabase.from('escala_slots').delete().eq('evento_id', ev.id);
      const slotRows = [];
      for (const cidade of Object.keys(ev.escala)) {
        for (const data of Object.keys(ev.escala[cidade])) {
          for (const slot of ev.escala[cidade][data]) {
            const operador_id = typeof slot === 'object' ? slot.id    : slot;
            const seg_id      = typeof slot === 'object' ? slot.segId : null;
            if (!seg_id) continue;
            slotRows.push({ evento_id: ev.id, cidade, data, operador_id, seg_id });
          }
        }
      }
      if (slotRows.length > 0) {
        const { error } = await supabase.from('escala_slots').insert(slotRows);
        if (error) throw new Error('escala_slots ' + ev.id + ': ' + error.message);
        console.log('  ✓ escala_slots ' + ev.id + ': ' + slotRows.length + ' slots');
      }
    }

    // Vagas override
    if (ev.vagasOverride && Object.keys(ev.vagasOverride).length > 0) {
      await supabase.from('vagas_override').delete().eq('evento_id', ev.id);
      const rows = [];
      for (const cidade of Object.keys(ev.vagasOverride)) {
        for (const data of Object.keys(ev.vagasOverride[cidade])) {
          for (const segId of Object.keys(ev.vagasOverride[cidade][data])) {
            rows.push({ evento_id: ev.id, cidade, data, seg_id: segId, vagas: ev.vagasOverride[cidade][data][segId] });
          }
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('vagas_override').insert(rows);
        if (error) throw new Error('vagas_override ' + ev.id + ': ' + error.message);
        console.log('  ✓ vagas_override ' + ev.id + ': ' + rows.length);
      }
    }

    // Horário override
    if (ev.horarioOverride && Object.keys(ev.horarioOverride).length > 0) {
      await supabase.from('horario_override').delete().eq('evento_id', ev.id);
      const rows = [];
      for (const data of Object.keys(ev.horarioOverride)) {
        rows.push({
          evento_id:      ev.id,
          data,
          horario_inicio: ev.horarioOverride[data].inicio,
          horario_fim:    ev.horarioOverride[data].fim,
        });
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('horario_override').insert(rows);
        if (error) throw new Error('horario_override ' + ev.id + ': ' + error.message);
      }
    }

    console.log('✓ evento ' + ev.id + ' (' + ev.nome + ')');
  }

  console.log('\nMigração concluída com sucesso!');
}

migrar().catch(err => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
