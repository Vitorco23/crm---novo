# Plan: Normalized Placeholders and Retroactive Reminder Update

The goal is to make reminder placeholders case-insensitive (e.g., `[Nome]`, `[NOME]`, and `[nome]` should all work) and to retroactively update all pending reminders when this change is applied or when related data changes.

## Proposed Changes

### Core Logic

#### `src/modules/agenda/services/reminders.ts`
- **Case-Insensitive Rendering**:
    - Update `renderReminderTemplate` to use a case-insensitive regex for finding placeholders.
    - Normalize the found placeholder key (lowercase it) before looking it up in the data map.
    - Expand the map of placeholders to include common variations or just use a normalized lookup logic.
- **Retroactive Update**:
    - Implement a `refreshAllPendingReminders` function that iterates through all pending reminders in the system.
    - For each pending reminder, find its associated lead, meeting, and template, then re-render the `title` and `message`.
    - Ensure this function is called once after the logic update to "clean" existing reminders.
- **Improved Data Resolution**:
    - Ensure `renderReminderTemplate` handles missing data gracefully (e.g., returning an empty string or the placeholder itself if preferred).

### Initialization/Migration

#### `src/shared/services/store.ts` (or similar initialization point)
- Trigger `refreshAllPendingReminders` upon application load if a version/flag indicates it hasn't been done yet, ensuring all devices sync the corrected text.

## Verification Plan

### Manual Verification
1.  **Template Configuration**: Create or edit a template with varied casing: `[Nome]`, `[EMPRESA]`, `[data Da Reunião]`.
2.  **Creation Test**: Move a lead to a stage that triggers this template. Verify the generated reminder has the data correctly injected.
3.  **Retroactive Test**: 
    - Manually create a reminder in storage (via dev console or by temporary code) that contains `[NOME]` before the fix is applied.
    - Apply the fix and trigger the refresh.
    - Verify the existing reminder's text is now correctly rendered with the lead's name.
4.  **Case-Insensitivity**: Test all variations: `[nome]`, `[Nome]`, `[NOME]`, `[nOmE]`.

### Automated Verification (if applicable)
- Add unit tests for `renderReminderTemplate` covering various casing and missing data scenarios.
