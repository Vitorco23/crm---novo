// Agenda — mutações (Google Calendar). Refatoração 002.
import { supabase } from "@/integrations/supabase/client";
import type { MeetingInput, MeetingResult, TaskEventInput, TaskEventResult } from "./AgendaTypes";

export async function createMeeting(input: MeetingInput): Promise<MeetingResult> {
  const { data, error } = await supabase.functions.invoke("create-google-meeting", { body: input });
  if (error) throw new Error(error.message);
  return (data ?? {}) as MeetingResult;
}

export async function updateMeeting(input: {
  eventId: string;
  startISO: string;
  endISO: string;
  timeZone: string;
}): Promise<MeetingResult> {
  const { data, error } = await supabase.functions.invoke("update-google-meeting", { body: input });
  if (error) throw new Error(error.message);
  return (data ?? {}) as MeetingResult;
}

export async function createTaskEvent(input: TaskEventInput): Promise<TaskEventResult> {
  const { data, error } = await supabase.functions.invoke("create-task-event", { body: input });
  if (error) throw new Error(error.message);
  return (data ?? {}) as TaskEventResult;
}

export async function updateTaskEvent(input: TaskEventInput & { eventId: string }): Promise<TaskEventResult> {
  const { data, error } = await supabase.functions.invoke("update-task-event", { body: input });
  if (error) throw new Error(error.message);
  return (data ?? {}) as TaskEventResult;
}

export async function deleteTaskEvent(eventId: string): Promise<void> {
  await supabase.functions.invoke("delete-task-event", { body: { eventId } });
}
