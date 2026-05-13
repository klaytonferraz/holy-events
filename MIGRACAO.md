# Plano de Migração — localStorage → Supabase

## Pré-requisitos
- [ ] Schema executado no Supabase (SCHEMA.sql)
- [ ] Node.js instalado (verificar: `node --version`)
- [ ] Repositório clonado localmente
- [ ] Variáveis de ambiente configuradas no Vercel

## Passo 1 — Instalar dependências

```bash
cd C:\Users\klayt\iCloudDrive\Holy\Projeto_Escalas
npm init -y
npm install @supabase/supabase-js
```

## Passo 2 — Criar arquivo .env local

Criar arquivo `.env` na raiz do projeto (NÃO commitar — já está no .gitignore):

```
SUPABASE_URL=https://vokglodonqeihwkiwead.supabase.co
SUPABASE_SECRET_KEY=sua_secret_key_aqui
```

## Passo 3 — Criar estrutura de pastas

```
/api
  /operadores.js      GET /api/operadores, POST /api/operadores
  /operadores/[id].js PUT /api/operadores/:id, DELETE /api/operadores/:id
  /eventos.js         GET /api/eventos, POST /api/eventos
  /eventos/[id].js    PUT /api/eventos/:id, DELETE /api/eventos/:id
  /escala.js          GET /api/escala?eventoId=&cidade=&data=
                      POST /api/escala (salvar slots de um dia)
  /segmentos.js       GET /api/segmentos
  /clientes.js        GET /api/clientes, POST /api/clientes
  /config.js          GET /api/config, PUT /api/config
  /migrar.js          POST /api/migrar (recebe DB do localStorage e popula banco)
```

## Passo 4 — Implementar as Vercel Functions

Cada função segue o padrão:

```javascript
// api/operadores.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('operadores')
      .select('*, operador_bloqueios(data)')
      .order('nome');
    if (error) return res.status(500).json({ error });
    return res.status(200).json(data);
  }
  // POST, PUT, DELETE...
}
```

## Passo 5 — Criar endpoint de migração

O endpoint `/api/migrar` recebe o conteúdo do localStorage (exportado pelo browser)
e insere todos os dados no banco. Executado UMA única vez.

No browser (console do DevTools), antes de migrar:
```javascript
copy(JSON.stringify(JSON.parse(localStorage.getItem('holy_v4'))))
```
Isso copia o banco atual para a área de transferência.

## Passo 6 — Adaptar o index.html

Substituir as chamadas ao localStorage por chamadas fetch() à API:

```javascript
// ANTES (localStorage)
function persist() {
  localStorage.setItem('holy_v4', JSON.stringify(DB));
}

// DEPOIS (API)
async function persist() {
  // Salva no banco via API
  // localStorage vira cache local para offline
  localStorage.setItem('holy_v4_cache', JSON.stringify(DB));
}
```

A estratégia é:
1. Na inicialização: tenta carregar do banco; fallback para localStorage
2. Ao salvar: salva no banco E atualiza o cache localStorage
3. Se banco indisponível: opera offline com cache, sincroniza quando voltar

## Passo 7 — Deploy e teste

```bash
git add .
git commit -m "feat: migração para Supabase PostgreSQL"
git push
```

O Vercel faz o deploy automaticamente. Testar em holy-events.vercel.app.

## Ordem de implementação recomendada

1. `/api/segmentos.js` — mais simples, sem relacionamentos
2. `/api/operadores.js` — com bloqueios
3. `/api/clientes.js`
4. `/api/eventos.js` — com segmentos e dias especiais
5. `/api/escala.js` — mais complexo
6. `/api/migrar.js` — migração única
7. Adaptar index.html para usar APIs

## Notas importantes

- Os IDs dos operadores (1-25 para defaults) devem ser preservados
  pois as escalas referenciam esses IDs
- O formato de slots `{id, segId}` no localStorage vira linhas
  separadas na tabela `escala_slots`
- Holy Drinks (isHoly=true) tem capacidade=6 e holyVagas configurado por evento
- Após migração bem-sucedida, o localStorage pode ser mantido como cache
  mas não como fonte primária de verdade

