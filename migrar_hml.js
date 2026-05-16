// Migra dados do dados_localstorage.json para o banco HML.
// Uso: node --env-file=.env.hml migrar_hml.js
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

// Reutiliza a mesma lógica do migrar_local.js
async function migrar() {
  const { error: cfgErr } = await supabase.from('config').update({
    alert_days: db.config.alertDays, popup: db.config.popup,
    auto_holy: db.config.autoHoly,  trash_days: db.config.trashDays,
  }).eq('id', 1);
  if (cfgErr) throw new Error('config: ' + cfgErr.message);
  console.log('✓ config');

  const usrRows = db.users.map(u => ({ username: u.user, password: u.pass, name: u.name }));
  const { error: usrErr } = await supabase.from('usuarios').upsert(usrRows, { onConflict: 'username' });
  if (usrErr) throw new Error('usuarios: ' + usrErr.message);
  console.log('✓ usuarios:', usrRows.length);

  const clRows = db.clientes.map(c => ({
    id: c.id, nome: c.nome, contato: c.contato||'', tel: c.tel||'', email: c.email||'', obs: c.obs||'',
  }));
  const { error: clErr } = await supabase.from('clientes').upsert(clRows, { onConflict: 'id' });
  if (clErr) throw new Error('clientes: ' + clErr.message);
  console.log('✓ clientes:', clRows.length);

  const opRows = db.operadores.map(op => ({
    id: op.id, nome: op.nome, produto: op.produto||'', poc: op.poc||'',
    tel: op.tel||'', insta: op.insta||'', tipo: op.tipo||'Truck',
    status: op.status||'Contratado', cidades: op.cidades||'',
    carga: op.carga||'', volt: op.volt||'', dim: op.dim||'', obs: op.obs||'',
    capacidade: op.capacidade||1, is_holy: op.isHoly||false, segmentos: op.segmentos||[],
  }));
  const { error: opErr } = await supabase.from('operadores').upsert(opRows, { onConflict: 'id' });
  if (opErr) throw new Error('operadores: ' + opErr.message);
  console.log('✓ operadores:', opRows.length);

  const bloqRows = [];
  for (const op of db.operadores)
    (op.bloqueios||[]).forEach(d => bloqRows.push({ operador_id: op.id, data: d }));
  if (bloqRows.length) {
    const { error: bErr } = await supabase.from('operador_bloqueios').upsert(bloqRows, { onConflict: 'operador_id,data' });
    if (bErr) throw new Error('bloqueios: ' + bErr.message);
    console.log('✓ operador_bloqueios:', bloqRows.length);
  }

  for (const ev of db.eventos) {
    const { error: evErr } = await supabase.from('eventos').upsert({
      id: ev.id, nome: ev.nome, edicao: ev.edicao||'', apelido: ev.apelido||'',
      cliente_id: ev.clienteId||null, status: ev.status||'ativo',
      inicio: ev.inicio||null, fim: ev.fim||null,
      horario_inicio: ev.horarioInicio||null, horario_fim: ev.horarioFim||null,
      publico_dia: ev.publicoDia||0, cidades: ev.cidades||[], obs: ev.obs||'',
      dias_semana: ev.dias||[], manually_closed: ev.manuallyClosed||false, deleted_at: ev.deletedAt||null,
    }, { onConflict: 'id' });
    if (evErr) throw new Error('evento ' + ev.id + ': ' + evErr.message);

    if (ev.segmentosConfig?.length) {
      await supabase.from('evento_segmentos').delete().eq('evento_id', ev.id);
      const { error: sErr } = await supabase.from('evento_segmentos').insert(
        ev.segmentosConfig.map(s => ({ evento_id: ev.id, seg_id: s.segId, vagas: s.vagas||0, holy_vagas: s.holyVagas||0 }))
      );
      if (sErr) throw new Error('evento_segmentos ' + ev.id + ': ' + sErr.message);
    }

    if (ev.diasEspeciais?.length) {
      await supabase.from('evento_dias_especiais').delete().eq('evento_id', ev.id);
      const { error: dErr } = await supabase.from('evento_dias_especiais').insert(
        ev.diasEspeciais.map(d => ({ evento_id: ev.id, data: d }))
      );
      if (dErr) throw new Error('dias_especiais ' + ev.id + ': ' + dErr.message);
    }

    if (ev.escala && Object.keys(ev.escala).length) {
      await supabase.from('escala_slots').delete().eq('evento_id', ev.id);
      const slots = [];
      for (const cid of Object.keys(ev.escala))
        for (const dt of Object.keys(ev.escala[cid]))
          for (const slot of ev.escala[cid][dt]) {
            const operador_id = typeof slot === 'object' ? slot.id : slot;
            const seg_id      = typeof slot === 'object' ? slot.segId : null;
            if (seg_id) slots.push({ evento_id: ev.id, cidade: cid, data: dt, operador_id, seg_id });
          }
      if (slots.length) {
        const { error: slErr } = await supabase.from('escala_slots').insert(slots);
        if (slErr) throw new Error('escala_slots ' + ev.id + ': ' + slErr.message);
        console.log('  ✓ escala_slots', ev.id + ':', slots.length, 'slots');
      }
    }

    if (ev.vagasOverride && Object.keys(ev.vagasOverride).length) {
      await supabase.from('vagas_override').delete().eq('evento_id', ev.id);
      const rows = [];
      for (const cid of Object.keys(ev.vagasOverride))
        for (const dt of Object.keys(ev.vagasOverride[cid]))
          for (const segId of Object.keys(ev.vagasOverride[cid][dt]))
            rows.push({ evento_id: ev.id, cidade: cid, data: dt, seg_id: segId, vagas: ev.vagasOverride[cid][dt][segId] });
      if (rows.length) await supabase.from('vagas_override').insert(rows);
    }

    if (ev.horarioOverride && Object.keys(ev.horarioOverride).length) {
      await supabase.from('horario_override').delete().eq('evento_id', ev.id);
      const rows = Object.keys(ev.horarioOverride).map(dt => ({
        evento_id: ev.id, data: dt,
        horario_inicio: ev.horarioOverride[dt].inicio,
        horario_fim:    ev.horarioOverride[dt].fim,
      }));
      if (rows.length) await supabase.from('horario_override').insert(rows);
    }

    console.log('✓ evento', ev.id, '(' + ev.nome + ')');
  }

  console.log('\n✓ Migração HML concluída!');
}

migrar().catch(err => { console.error('\nERRO:', err.message); process.exit(1); });
