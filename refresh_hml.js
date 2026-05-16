// Copia todos os dados do PRD para o HML (sobrescreve HML).
// Uso: node refresh_hml.js
// Requer: .env (PRD) e .env.hml no mesmo diretório.
//
// Lê as credenciais dos dois arquivos .env manualmente.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const lines = fs.readFileSync(path.join(__dirname, file), 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^=]+)=(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const prd = loadEnv('.env');
const hml = loadEnv('.env.hml');

const PRD = createClient(prd.SUPABASE_URL, prd.SUPABASE_SECRET_KEY);
const HML = createClient(hml.SUPABASE_URL, hml.SUPABASE_SECRET_KEY);

async function copyTable(name, prdQuery, hmlTransform, conflictCol) {
  const { data, error } = await prdQuery;
  if (error) throw new Error(name + ' PRD read: ' + error.message);
  if (!data || data.length === 0) { console.log('  ' + name + ': vazio'); return; }

  const rows = hmlTransform ? data.map(hmlTransform) : data;

  // Upsert: insere ou atualiza (idempotente para qualquer tipo de PK)
  const conflict = conflictCol || 'id';
  const { error: insErr } = await HML.from(name).upsert(rows, { onConflict: conflict });
  if (insErr) throw new Error(name + ' HML upsert: ' + insErr.message);
  console.log('  ✓ ' + name + ': ' + rows.length + ' registros');
}

async function refresh() {
  console.log('🔄 Copiando PRD → HML...\n');

  // config (tabela com id fixo = 1)
  {
    const { data, error } = await PRD.from('config').select('*').eq('id', 1).single();
    if (error) throw new Error('config PRD: ' + error.message);
    const { error: upErr } = await HML.from('config').update({
      alert_days: data.alert_days, popup: data.popup,
      auto_holy: data.auto_holy, trash_days: data.trash_days,
    }).eq('id', 1);
    if (upErr) throw new Error('config HML: ' + upErr.message);
    console.log('  ✓ config');
  }

  // usuarios
  {
    const { data, error } = await PRD.from('usuarios').select('username,password,name');
    if (error) throw new Error('usuarios PRD: ' + error.message);
    for (const u of data) {
      await HML.from('usuarios').upsert({ username: u.username, password: u.password, name: u.name }, { onConflict: 'username' });
    }
    console.log('  ✓ usuarios: ' + data.length);
  }

  // segmentos
  await copyTable('segmentos',
    PRD.from('segmentos').select('id,nome,icone,cor,ordem'),
    r => ({ id: r.id, nome: r.nome, icone: r.icone, cor: r.cor, ordem: r.ordem })
  );

  // clientes
  await copyTable('clientes',
    PRD.from('clientes').select('id,nome,contato,tel,email,obs'),
    r => ({ id: r.id, nome: r.nome, contato: r.contato, tel: r.tel, email: r.email, obs: r.obs })
  );

  // operadores (upsert — preserva FK com escala_slots)
  {
    const { data, error } = await PRD.from('operadores').select('*');
    if (error) throw new Error('operadores PRD: ' + error.message);
    if (data.length) {
      const { error: opErr } = await HML.from('operadores').upsert(
        data.map(({ created_at: _, ...r }) => r), { onConflict: 'id' }
      );
      if (opErr) throw new Error('operadores HML upsert: ' + opErr.message);
    }
    console.log('  ✓ operadores: ' + data.length);

    // bloqueios
    const { data: bloq, error: bErr } = await PRD.from('operador_bloqueios').select('operador_id,data');
    if (bErr) throw new Error('bloqueios PRD: ' + bErr.message);
    if (bloq.length) {
      const { error: biErr } = await HML.from('operador_bloqueios').upsert(bloq, { onConflict: 'operador_id,data' });
      if (biErr) throw new Error('bloqueios HML upsert: ' + biErr.message);
    }
    console.log('  ✓ operador_bloqueios: ' + bloq.length);
  }

  // eventos e subtabelas (upsert eventos + delete/re-insert subtabelas)
  {
    const { data: evs, error } = await PRD.from('eventos').select('*');
    if (error) throw new Error('eventos PRD: ' + error.message);

    for (const ev of evs) {
      // Upsert evento principal
      const { created_at: _, ...evRow } = ev;
      const { error: evErr } = await HML.from('eventos').upsert(evRow, { onConflict: 'id' });
      if (evErr) throw new Error('evento ' + ev.id + ': ' + evErr.message);

      // Subtabelas: delete específico + re-insert
      for (const tbl of ['evento_segmentos','evento_dias_especiais','vagas_override','horario_override','escala_slots']) {
        await HML.from(tbl).delete().eq('evento_id', ev.id);
        const { data: rows, error: rErr } = await PRD.from(tbl).select('*').eq('evento_id', ev.id);
        if (rErr) throw new Error(tbl + ' PRD: ' + rErr.message);
        if (rows.length) {
          const clean = rows.map(({ id: _, created_at: __, ...r }) => r);
          const { error: insErr } = await HML.from(tbl).insert(clean);
          if (insErr) throw new Error(tbl + ' HML: ' + insErr.message);
        }
      }
      console.log('  ✓ evento ' + ev.id + ' (' + ev.nome + ')');
    }
  }

  console.log('\n✅ Refresh PRD → HML concluído!');
}

refresh().catch(err => { console.error('\nERRO:', err.message); process.exit(1); });
