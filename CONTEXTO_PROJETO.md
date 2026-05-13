# Holy Events Manager — Contexto para Claude Code

## O que é este projeto
Sistema web de gestão de escalas de operadores (food trucks) em eventos gastronômicos.
Desenvolvido para a Holy Drinks Serviços de Bar Ltda (CNPJ 59.049.020/0001-08).

## Stack atual
- Frontend: HTML único + JavaScript vanilla (sem framework)
- Armazenamento atual: localStorage do navegador (chave: `holy_v4`)
- Repositório: github.com/klaytonferraz/holy-events
- Hospedagem: Vercel (holy-events.vercel.app) — deploy automático no push da branch main
- Banco de dados: Supabase PostgreSQL (já criado, schema ainda não executado)

## Objetivo desta sessão
Migrar o armazenamento de dados do localStorage para o Supabase PostgreSQL,
mantendo o frontend HTML/JS funcionando, adicionando uma camada de API
via Vercel Functions.

## Infraestrutura já configurada
- Supabase URL: https://vokglodonqeihwkiwead.supabase.co
- Variáveis de ambiente já configuradas no Vercel:
  - SUPABASE_URL
  - SUPABASE_PUBLISHABLE_KEY
  - SUPABASE_SECRET_KEY

## Arquivo principal
O sistema inteiro está em: `index.html` (único arquivo, ~2841 linhas)
Versão atual: 1.5.2

## Estrutura de dados atual (localStorage)
```javascript
DB = {
  _version: 9,
  users: [{user, pass, name}],
  config: {alertDays, popup, autoHoly, trashDays},
  segmentos: [{id, nome, icone, cor}],
  clientes: [{id, nome, contato, tel, email, obs, eventos[]}],
  operadores: [{
    id,           // número inteiro (1-25 para defaults, Date.now() para novos)
    nome, produto, poc, tel, insta, tipo, status,
    cidades,      // string CSV: "São Paulo, Curitiba"
    carga, volt, dim, obs,
    capacidade,   // integer — operações simultâneas (Holy=6)
    isHoly,       // boolean
    bloqueios,    // array de strings: ["2026-05-20", "2026-06-15"]
    segmentos     // array de strings: ["seg1", "seg2"]
  }],
  eventos: [{
    id,           // string: "ev1", "ev2", "ev"+Date.now()
    nome, edicao, apelido,
    clienteId,
    status,       // "ativo"|"concluido"|"cancelado"|"adiado"|"excluido"
    inicio, fim,  // strings "YYYY-MM-DD"
    horarioInicio, horarioFim,
    publicoDia,   // integer
    dias,         // array de JS weekdays [0=Dom..6=Sab]: [3,4,5,6,0]
    diasEspeciais, // array de strings "YYYY-MM-DD"
    cidades,      // array de strings: ["São Paulo"]
    obs,
    segmentosConfig: [{
      segId,      // "seg1"|"seg2"|"seg3"|"seg4"
      vagas,      // integer
      holyVagas   // integer — vagas padrão da Holy Drinks (só seg2)
    }],
    escala: {
      "São Paulo": {
        "2026-05-15": [{id: 1, segId: "seg2"}, {id: 1, segId: "seg2"}]
        // array de slots — cada slot = {id: operadorId, segId: segmentoId}
        // Holy Drinks com holyVagas=2 aparece 2x no array
      }
    },
    vagasOverride: {
      "São Paulo": {
        "2026-05-20": {"seg1": 4}  // override de vagas para dia específico
      }
    },
    horarioOverride: {
      "2026-05-20": {inicio: "18:00", fim: "23:00"}
    },
    manuallyClosed: false,
    deletedAt: null  // timestamp se status=excluido
  }]
}
```

## Schema SQL já preparado
O arquivo `SCHEMA.sql` na raiz do projeto contém o schema completo.
Execute-o no SQL Editor do Supabase antes de continuar.

## Plano de migração (ver MIGRACAO.md para detalhes)
1. Executar SCHEMA.sql no Supabase
2. Criar Vercel Functions como API REST em /api/
3. Criar script de migração que lê localStorage e popula o banco
4. Adaptar o index.html para usar a API em vez do localStorage
5. localStorage vira cache/fallback offline

## Padrões importantes do código
- NUNCA usar backtick dentro de template literal no HTML gerado por JS
  (causa bugs silenciosos no browser — usar concatenação de string)
- Slots de escala usam formato {id, segId} — não array flat de IDs
- IDs de operadores são inteiros; IDs de eventos são strings
- getSlots(ev, cid, dateKey) normaliza legado flat → {id,segId}
- DB_VERSION controla migração automática do schema localStorage

## Versões anteriores que podem existir no localStorage do usuário
O sistema tem lógica de migração automática de versões antigas.
Ao migrar para banco, considerar que alguns dados podem estar em formato legado.
