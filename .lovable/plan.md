# Plan - Fix Lead Deletion Sync Issue

The goal is to ensure that when a lead is deleted in the CRM, it is removed from both local storage and the cloud source of truth, preventing it from reappearing after a page refresh.

## User Review Required

> [!IMPORTANT]
> The deletion now uses a "tombstone" system. Deleted lead IDs are stored in a special key `p21_deleted_leads_tombstones` to ensure they are never re-imported from the cloud or inbound queues during synchronization.

## Proposed Changes

### Storage Logic (`src/shared/services/store.ts`)
- Update `deleteLead` and `deleteLeadsBatch` to record deleted IDs in a `p21_deleted_leads_tombstones` array.
- This array is automatically synced to the cloud via the existing `usave` mechanism.

### Sync Logic (`src/shared/services/userStorage.ts`)
- Add `p21_deleted_leads_tombstones` to the list of scoped keys for cloud synchronization.
- Modify `syncFromCloud` to read tombstones first and filter out any leads from the cloud payload (`p21_leads`) that match a tombstone ID.
- Update `syncInboundLeads` to ignore incoming leads that have already been marked as deleted (matching a tombstone ID).
- Ensure that if a lead is filtered out from the cloud payload locally, the cleaned list is pushed back to the cloud to eventually remove the record from the main `p21_leads` row.

## Technical Details

- **New Key**: `p21_deleted_leads_tombstones` stores an array of UUIDs.
- **Filtering**: Before merging cloud leads into local state, a filter is applied: `leads.filter(l => !tombstoneSet.has(l.id))`.
- **Inbound Protection**: The same filter is applied when processing the `leads_inbound` queue.

## Verification Plan

### Automated Tests
- Run a Playwright script that:
  1. Creates a test lead.
  2. Deletes the lead.
  3. Triggers a sync/reload.
  4. Verifies the lead does not reappear.

### Manual Verification
- Check the "View Backend" tool to confirm the `p21_deleted_leads_tombstones` key is being populated in the `user_storage` table.
- Verify that a full page refresh (CMD+R) does not bring back deleted leads.
