-- Enable RLS on realtime.messages and restrict subscriptions to user-scoped topics
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only subscribe to own user-scoped topics" ON realtime.messages;

CREATE POLICY "Users can only subscribe to own user-scoped topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'user_storage:' || auth.uid()::text
);
