-- ============================================================
-- Holy Events Manager — Schema PostgreSQL (Supabase)
-- Versão: 1.0
-- Como usar: cole todo este conteúdo no SQL Editor do Supabase
--            e clique em Run
-- ============================================================

-- Limpar tabelas existentes (seguro para primeira execução)
DROP TABLE IF EXISTS escala_slots CASCADE;
DROP TABLE IF EXISTS vagas_override CASCADE;
DROP TABLE IF EXISTS horario_override CASCADE;
DROP TABLE IF EXISTS evento_dias_especiais CASCADE;
DROP TABLE IF EXISTS evento_segmentos CASCADE;
DROP TABLE IF EXISTS operador_bloqueios CASCADE;
DROP TABLE IF EXISTS eventos CASCADE;
DROP TABLE IF EXISTS operadores CASCADE;
DROP TABLE IF EXISTS segmentos CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS config CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- ── USUÁRIOS ─────────────────────────────────────────────────
CREATE TABLE usuarios (
  id          SERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONFIGURAÇÃO ─────────────────────────────────────────────
CREATE TABLE config (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  alert_days  INTEGER DEFAULT 3,
  popup       BOOLEAN DEFAULT TRUE,
  auto_holy   BOOLEAN DEFAULT TRUE,
  trash_days  INTEGER DEFAULT 30,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO config DEFAULT VALUES;

-- ── SEGMENTOS ────────────────────────────────────────────────
CREATE TABLE segmentos (
  id          TEXT PRIMARY KEY,  -- 'seg1', 'seg2', etc.
  nome        TEXT NOT NULL,
  icone       TEXT NOT NULL,
  cor         TEXT NOT NULL,
  ordem       INTEGER DEFAULT 0
);

INSERT INTO segmentos (id, nome, icone, cor, ordem) VALUES
  ('seg1', 'Alimentos',  '🍔', '#E0A252', 1),
  ('seg2', 'Bebidas',    '🍷', '#5290E0', 2),
  ('seg3', 'Sobremesa',  '🍰', '#A07AF0', 3),
  ('seg4', 'Snacks',     '🍿', '#4CAF7C', 4);

-- ── CLIENTES ────────────────────────────────────────────────
CREATE TABLE clientes (
  id          TEXT PRIMARY KEY,  -- 'cl1', 'cl2', ou UUID
  nome        TEXT NOT NULL,
  contato     TEXT,
  tel         TEXT,
  email       TEXT,
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── OPERADORES ──────────────────────────────────────────────
CREATE TABLE operadores (
  id            INTEGER PRIMARY KEY,  -- mantém IDs numéricos do localStorage
  nome          TEXT NOT NULL,
  produto       TEXT,
  poc           TEXT,
  tel           TEXT,
  insta         TEXT,
  tipo          TEXT DEFAULT 'Truck',
  status        TEXT DEFAULT 'Contratado',
  cidades       TEXT,               -- CSV: 'São Paulo, Curitiba'
  carga         TEXT,
  volt          TEXT,
  dim           TEXT,
  obs           TEXT,
  capacidade    INTEGER DEFAULT 1,  -- operações simultâneas
  is_holy       BOOLEAN DEFAULT FALSE,
  segmentos     TEXT[],             -- array: '{seg1,seg2}'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── OPERADOR BLOQUEIOS ───────────────────────────────────────
CREATE TABLE operador_bloqueios (
  id            SERIAL PRIMARY KEY,
  operador_id   INTEGER NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
  data          DATE NOT NULL,
  UNIQUE(operador_id, data)
);

-- ── EVENTOS ─────────────────────────────────────────────────
CREATE TABLE eventos (
  id              TEXT PRIMARY KEY,  -- 'ev1', 'ev2', ou 'ev'+timestamp
  nome            TEXT NOT NULL,
  edicao          TEXT,
  apelido         TEXT,
  cliente_id      TEXT REFERENCES clientes(id),
  status          TEXT DEFAULT 'ativo',
  inicio          DATE,
  fim             DATE,
  horario_inicio  TEXT,
  horario_fim     TEXT,
  publico_dia     INTEGER DEFAULT 0,
  cidades         TEXT[],            -- array: '{São Paulo,Curitiba}'
  obs             TEXT,
  dias_semana     INTEGER[],         -- array JS weekdays: {3,4,5,6,0}
  manually_closed BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── EVENTO SEGMENTOS (vagas por segmento) ───────────────────
CREATE TABLE evento_segmentos (
  id          SERIAL PRIMARY KEY,
  evento_id   TEXT NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  seg_id      TEXT NOT NULL REFERENCES segmentos(id),
  vagas       INTEGER DEFAULT 0,
  holy_vagas  INTEGER DEFAULT 0,    -- vagas padrão da Holy Drinks
  UNIQUE(evento_id, seg_id)
);

-- ── EVENTO DIAS ESPECIAIS ────────────────────────────────────
CREATE TABLE evento_dias_especiais (
  id          SERIAL PRIMARY KEY,
  evento_id   TEXT NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  UNIQUE(evento_id, data)
);

-- ── ESCALA SLOTS ────────────────────────────────────────────
-- Cada linha = um slot ocupado por um operador em um dia
CREATE TABLE escala_slots (
  id            SERIAL PRIMARY KEY,
  evento_id     TEXT NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  cidade        TEXT NOT NULL,
  data          DATE NOT NULL,
  operador_id   INTEGER NOT NULL REFERENCES operadores(id),
  seg_id        TEXT NOT NULL REFERENCES segmentos(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_escala_evento_data ON escala_slots(evento_id, data, cidade);

-- ── VAGAS OVERRIDE (ajuste manual por dia) ──────────────────
CREATE TABLE vagas_override (
  id          SERIAL PRIMARY KEY,
  evento_id   TEXT NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  cidade      TEXT NOT NULL,
  data        DATE NOT NULL,
  seg_id      TEXT NOT NULL REFERENCES segmentos(id),
  vagas       INTEGER NOT NULL,
  UNIQUE(evento_id, cidade, data, seg_id)
);

-- ── HORÁRIO OVERRIDE (ajuste manual por dia) ────────────────
CREATE TABLE horario_override (
  id              SERIAL PRIMARY KEY,
  evento_id       TEXT NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  data            DATE NOT NULL,
  horario_inicio  TEXT NOT NULL,
  horario_fim     TEXT NOT NULL,
  UNIQUE(evento_id, data)
);

-- ============================================================
-- Habilitar Row Level Security (RLS) — acesso público por ora
-- Quando implementar autenticação, ajustar as policies
-- ============================================================
ALTER TABLE usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmentos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE operadores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE operador_bloqueios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_segmentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_dias_especiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_slots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vagas_override      ENABLE ROW LEVEL SECURITY;
ALTER TABLE horario_override    ENABLE ROW LEVEL SECURITY;

-- Policies temporárias — acesso total via anon key
-- (substituir por policies de autenticação real depois)
CREATE POLICY "allow_all" ON usuarios            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON config              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON segmentos           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON clientes            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON operadores          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON operador_bloqueios  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON eventos             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON evento_segmentos    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON evento_dias_especiais FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON escala_slots        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON vagas_override      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON horario_override    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Schema criado com sucesso!
-- Próximo passo: rodar a migração de dados via Claude Code
-- ============================================================
