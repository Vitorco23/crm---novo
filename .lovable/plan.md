# Plan: Lead Import - Upsert Logic for Duplicates

Enhance the lead import process to support "upsert" behavior. Instead of ignoring duplicates, the CRM will now merge new information into existing leads while preserving their current pipeline stage.

## User Review Required

> [!IMPORTANT]
> The duplicate detection logic uses three identifiers: **Phone**, **Company Name**, and **Google Meu Negócio Link**. If *any* of these match an existing lead, it will be considered a duplicate and updated instead of skipped.

## Proposed Changes

### CRM Core Logic
#### [PipelineBoard.tsx](src/modules/pipeline/components/PipelineBoard.tsx)
- Refactor `handleConfirmMapping` to:
    - Identify existing leads by Normalized Phone, Company Name, or GMN Link.
    - If a match is found:
        - Prepare an update object with the new information from the spreadsheet.
        - Merge tags (add the new tag to existing ones if not present).
        - **Keep the current `stage`** (do not move the lead back to "Novo Lead" if it's already in "Tentativa 3", for example).
        - Update the `icpStars` if provided in the spreadsheet.
    - If no match is found:
        - Create a new lead as before.
- Update the success/warning toast messages to reflect "updated" counts instead of "ignored" counts.

#### [store.ts](src/shared/services/store.ts)
- Add a new helper function `upsertLeadsBatch` to handle the batch update/creation efficiently, or simply use `updateLead` and `addLeadsBatch` sequentially within `PipelineBoard`. (Refactoring `PipelineBoard` directly is safer to ensure stage preservation logic remains local to the import context).

## Technical Details
- **Normalization**: Use `normalizePhoneBR` for phone comparison and `.trim().toLowerCase()` for text fields.
- **Fields to Update**: All mapped fields (contact, website, niche, city, notes, googleRating, googleReviews, icpStars) will overwrite existing data if present in the spreadsheet.
- **Tags**: The new import tag will be appended to the lead's `tags` array (deduplicated).

## Verification Plan

### Manual Verification
1. Prepare a CSV with a lead that already exists in the CRM (same phone or company).
2. Move the existing lead to a specific stage (e.g., "Tentativa 3").
3. Import the CSV.
4. Verify that the lead remains in "Tentativa 3".
5. Verify that any new info (e.g., a new note or updated niche) appears in the lead details.
6. Verify the toast message says "X leads importados • Y atualizados".
