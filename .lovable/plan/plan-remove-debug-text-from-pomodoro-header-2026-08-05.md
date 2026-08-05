# Plan: Remove Debug Text from Pomodoro Header

The user is reporting that unwanted debugging/sprint context text is appearing next to the Pomodoro timer in the operational console on the Cold Call page.

## Proposed Changes

### UI Components

#### `src/modules/cold-call/components/PomodoroHeaderWidget.tsx`
- Remove the debug/sprint information `div` (lines 143-147) that displays the instruction context.

## Verification Plan

### Manual Verification
- Navigate to the Cold Call page.
- Verify that the operational console (Pomodoro, Script, etc.) is visible.
- Confirm that the text "Antes de realizar qualquer ação..." is no longer displayed.
