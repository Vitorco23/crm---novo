
## Problema

A conta `admin@p21.local` foi criada via SQL direto na tabela `auth.users` com campos de token (`confirmation_token`, `recovery_token`, `email_change_token_new`, etc.) como `NULL`. O GoTrue (serviço de auth) faz `Scan` desses campos como `string` e quebra com:

> `error finding user: sql: Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported`

Resultado: qualquer login/signup com esse e-mail retorna 500.

Além disso, a senha `admin` tem 5 caracteres e o projeto exige mínimo 6, então não é uma senha válida no Supabase.

## Solução

1. **Migration de correção** em `auth.users` para o admin:
   - Setar todos os campos de token `NULL` para `''` (string vazia) — corrige o erro do GoTrue.
   - Garantir `email_confirmed_at = now()` (já confirmado, sem precisar verificar e-mail).
   - Atualizar `encrypted_password` com hash bcrypt de uma senha **com no mínimo 6 caracteres**.

2. **Nova senha do admin**: como `admin` é inválida, propor `admin123` (6 caracteres). Se o usuário preferir outra, basta avisar.

3. **Login**: após a migration, entrar em `/auth` com:
   - Email: `admin@p21.local`
   - Senha: `admin123`

   Na primeira entrada, o `userStorage.ts` migra automaticamente todos os dados antigos (leads, finanças, sprints, metas, tarefas) do localStorage legado para o namespace do admin.

## Detalhes técnicos

SQL planejado (via tool de migration):

```sql
UPDATE auth.users
SET
  encrypted_password    = crypt('admin123', gen_salt('bf')),
  email_confirmed_at    = COALESCE(email_confirmed_at, now()),
  confirmation_token    = COALESCE(confirmation_token, ''),
  recovery_token        = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change          = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change          = COALESCE(phone_change, ''),
  phone_change_token    = COALESCE(phone_change_token, '')
WHERE email = 'admin@p21.local';
```

Nenhuma alteração de código frontend é necessária — o fluxo de login e a migração de dados já estão implementados.

## Confirme antes de executar

- Senha do admin pode ser **`admin123`**? Se preferir outra (≥ 6 caracteres), me diga qual.
