-- =========================================================================
-- Sprint 3 - Central de Inteligência IA + Knowledge Base
-- =========================================================================

create extension if not exists vector;

-- ---------- knowledge_documents ---------------------------------------------
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null,
  descricao text,
  tags text[] not null default '{}',
  conteudo_markdown text not null default '',
  versao integer not null default 1,
  ativo boolean not null default true,
  owner_email text not null default 'vitorco23@gmail.com',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.knowledge_documents to authenticated;
grant all on public.knowledge_documents to service_role;

alter table public.knowledge_documents enable row level security;

create policy "Owner reads knowledge documents"
  on public.knowledge_documents for select to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner inserts knowledge documents"
  on public.knowledge_documents for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner updates knowledge documents"
  on public.knowledge_documents for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner deletes knowledge documents"
  on public.knowledge_documents for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create index if not exists knowledge_documents_categoria_idx on public.knowledge_documents(categoria);
create index if not exists knowledge_documents_ativo_idx on public.knowledge_documents(ativo);
create index if not exists knowledge_documents_tags_idx on public.knowledge_documents using gin(tags);

-- ---------- knowledge_document_versions -------------------------------------
create table if not exists public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  versao integer not null,
  titulo text not null,
  categoria text not null,
  descricao text,
  tags text[] not null default '{}',
  conteudo_markdown text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.knowledge_document_versions to authenticated;
grant all on public.knowledge_document_versions to service_role;

alter table public.knowledge_document_versions enable row level security;

create policy "Owner reads version history"
  on public.knowledge_document_versions for select to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner writes version history"
  on public.knowledge_document_versions for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create index if not exists kdv_document_idx on public.knowledge_document_versions(document_id, versao desc);

-- Trigger: grava versão anterior e incrementa versao
create or replace function public.knowledge_document_snapshot_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') then
    -- Só cria snapshot quando conteúdo/metadados relevantes mudam
    if (OLD.conteudo_markdown is distinct from NEW.conteudo_markdown)
       or (OLD.titulo is distinct from NEW.titulo)
       or (OLD.categoria is distinct from NEW.categoria)
       or (OLD.descricao is distinct from NEW.descricao)
       or (OLD.tags is distinct from NEW.tags) then
      insert into public.knowledge_document_versions
        (document_id, versao, titulo, categoria, descricao, tags, conteudo_markdown)
      values
        (OLD.id, OLD.versao, OLD.titulo, OLD.categoria, OLD.descricao, OLD.tags, OLD.conteudo_markdown);
      NEW.versao := OLD.versao + 1;
      NEW.updated_at := now();
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_knowledge_documents_version on public.knowledge_documents;
create trigger trg_knowledge_documents_version
  before update on public.knowledge_documents
  for each row execute function public.knowledge_document_snapshot_version();

-- ---------- knowledge_chunks -------------------------------------------------
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.knowledge_chunks to authenticated;
grant all on public.knowledge_chunks to service_role;

alter table public.knowledge_chunks enable row level security;

create policy "Owner reads knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner writes knowledge chunks"
  on public.knowledge_chunks for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner updates knowledge chunks"
  on public.knowledge_chunks for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner deletes knowledge chunks"
  on public.knowledge_chunks for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create index if not exists knowledge_chunks_document_idx on public.knowledge_chunks(document_id, chunk_index);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Função de busca semântica
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer default 6,
  min_similarity real default 0.35,
  filter_categoria text default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  similarity real,
  titulo text,
  categoria text,
  versao integer,
  chunk_index integer
)
language sql
stable
set search_path = public
as $$
  select
    c.id as chunk_id,
    c.document_id,
    c.content,
    (1 - (c.embedding <=> query_embedding))::real as similarity,
    d.titulo,
    d.categoria,
    d.versao,
    c.chunk_index
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where d.ativo = true
    and (filter_categoria is null or d.categoria = filter_categoria)
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- intel_conversations ---------------------------------------------
create table if not exists public.intel_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null default 'vitorco23@gmail.com',
  title text not null default 'Chat Geral',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.intel_conversations to authenticated;
grant all on public.intel_conversations to service_role;

alter table public.intel_conversations enable row level security;

create policy "Owner manages conversations"
  on public.intel_conversations for all to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

-- ---------- intel_messages ---------------------------------------------------
create table if not exists public.intel_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.intel_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  specialist text,
  context_snapshot jsonb,
  citations jsonb,
  model_used text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.intel_messages to authenticated;
grant all on public.intel_messages to service_role;

alter table public.intel_messages enable row level security;

create policy "Owner reads intel messages"
  on public.intel_messages for select to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner writes intel messages"
  on public.intel_messages for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner updates intel messages"
  on public.intel_messages for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create policy "Owner deletes intel messages"
  on public.intel_messages for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'vitorco23@gmail.com');

create index if not exists intel_messages_conv_idx on public.intel_messages(conversation_id, created_at);

-- Trigger updated_at para conversations
create or replace function public.touch_intel_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.intel_conversations set updated_at = now() where id = NEW.conversation_id;
  return NEW;
end;
$$;

drop trigger if exists trg_intel_messages_touch on public.intel_messages;
create trigger trg_intel_messages_touch
  after insert on public.intel_messages
  for each row execute function public.touch_intel_conversation();