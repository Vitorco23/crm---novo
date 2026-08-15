create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

create table archive.intel_conversations_backup as select * from public.intel_conversations;
create table archive.intel_messages_backup as select * from public.intel_messages;
create table archive.knowledge_documents_backup as select * from public.knowledge_documents;
create table archive.knowledge_document_versions_backup as select * from public.knowledge_document_versions;
create table archive.knowledge_chunks_backup as select * from public.knowledge_chunks;

drop function if exists public.match_knowledge_chunks(vector, integer, real, text);

drop table if exists public.knowledge_chunks cascade;
drop table if exists public.knowledge_document_versions cascade;
drop table if exists public.knowledge_documents cascade;
drop table if exists public.intel_messages cascade;
drop table if exists public.intel_conversations cascade;

drop function if exists public.knowledge_document_snapshot_version() cascade;
drop function if exists public.touch_intel_conversation() cascade;