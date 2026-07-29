create or replace function public.knowledge_document_snapshot_version()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') then
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

create or replace function public.touch_intel_conversation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.intel_conversations set updated_at = now() where id = NEW.conversation_id;
  return NEW;
end;
$$;