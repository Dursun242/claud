import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { googleCalendar } from './googleCalendar';

/**
 * Hook to fetch Google Calendar events
 */
export function useGoogleCalendarEvents(accessToken, month) {
  return useQuery({
    queryKey: ['googleCalendar', 'events', month],
    queryFn: async () => {
      if (!accessToken) return [];

      // Get first and last day of month
      const [year, monthStr] = month.split('-');
      const timeMin = new Date(year, parseInt(monthStr) - 1, 1);
      const timeMax = new Date(year, parseInt(monthStr), 0, 23, 59, 59);

      const events = await googleCalendar.getEvents(
        accessToken,
        timeMin.toISOString(),
        timeMax.toISOString()
      );

      return events.map(e => ({
        id: e.id,
        summary: e.summary,
        description: e.description || '',
        location: e.location || '',
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        colorId: e.colorId,
      }));
    },
    enabled: !!accessToken,
  });
}

/**
 * Hook to create Google Calendar event
 */
export function useCreateGoogleCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accessToken, event }) => {
      const gcalEvent = {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: { dateTime: new Date(event.startDateTime).toISOString() },
        end: { dateTime: new Date(event.endDateTime).toISOString() },
      };
      return googleCalendar.createEvent(accessToken, gcalEvent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleCalendar'] });
    },
  });
}

/**
 * Hook to update Google Calendar event
 */
export function useUpdateGoogleCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accessToken, eventId, event }) => {
      const gcalEvent = {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: { dateTime: new Date(event.startDateTime).toISOString() },
        end: { dateTime: new Date(event.endDateTime).toISOString() },
      };
      return googleCalendar.updateEvent(accessToken, eventId, gcalEvent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleCalendar'] });
    },
  });
}

/**
 * Hook to delete Google Calendar event
 */
export function useDeleteGoogleCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accessToken, eventId }) => {
      return googleCalendar.deleteEvent(accessToken, eventId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleCalendar'] });
    },
  });
}
