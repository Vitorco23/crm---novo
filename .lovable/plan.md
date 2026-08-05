# Plan - Automatic Template Placeholders Expansion

Incorporate the `{decisor}` placeholder into the reminder template system and ensure the "Copy" functionality in the Reminders UI correctly replaces all placeholders with actual lead and meeting data.

## User Requirements
- Automatically replace `{nome}`, `{empresa}`, `{data}`, `{hora}`, `{link}`, `{protocolo}`, and `{decisor}` in reminder messages.
- Ensure the "Copy" button in the Reminders UI provides the final rendered text, not the raw template.
- Sychronization across devices (already implemented via the "Sincronizar" button, but I'll ensure the UI reflects the new placeholders).

## Technical Tasks

### 1. Logic Layer (`src/modules/agenda/services/reminders.ts`)
- Update `renderTemplate` function to include `{decisor}` (mapping to `lead.contact`).
- Ensure all existing placeholders (`{nome}`, `{empresa}`, `{data}`, `{hora}`, `{link}`, `{protocolo}`) are correctly extracted from both `Lead` and its latest `Meeting`.

### 2. UI Layer (`src/modules/agenda/pages/Lembretes.tsx`)
- Update the descriptive text in `TemplatesConfig` and `TemplateEditor` to include `{decisor}` in the list of available markers.
- Modify the `copy` function in the `Lembretes` component. Currently, it copies `r.message` directly. If `r.message` is already rendered (which it should be if generated via `createRemindersForStageChange`), we just need to ensure the generation logic is robust.
- **Self-Correction**: The `createRemindersForStageChange` function already calls `renderTemplate`. I will double-check if there's any case where the user might want to copy a *template* directly or if the *generated reminder* needs re-rendering. Based on the request, it seems the user wants the *reminders* generated from templates to be accurate.

### 3. Verification
- Test generation of reminders when moving a lead.
- Click "Copy" on a generated reminder and verify the clipboard content.

## Dependencies
- `src/shared/services/store.ts` for Lead and Meeting types.
- `src/modules/agenda/services/reminders.ts` as the engine.
