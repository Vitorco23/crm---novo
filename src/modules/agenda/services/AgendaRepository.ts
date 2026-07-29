// Agenda — ponto oficial de acesso a dados do domínio. Refatoração 002.
import * as Queries from "./AgendaQueries";
import * as Mutations from "./AgendaMutations";

export const AgendaRepository = {
  listGoogleEvents: Queries.listGoogleEvents,
  calendarStatus: Queries.getGoogleCalendarStatus,
  createMeeting: Mutations.createMeeting,
  updateMeeting: Mutations.updateMeeting,
  createTaskEvent: Mutations.createTaskEvent,
  updateTaskEvent: Mutations.updateTaskEvent,
  deleteTaskEvent: Mutations.deleteTaskEvent,
};

export type AgendaRepositoryType = typeof AgendaRepository;
