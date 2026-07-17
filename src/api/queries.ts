import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Allergy,
  CaregiverScope,
  Consent,
  ConsentKind,
  DoseLog,
  Id,
  MessageThread,
  PatientTask,
  ReminderPrefs,
  VitalKind,
} from '@/domain/types';
import type { CaregiverInvite, ContactUpdate } from '@/domain/profile';
import type { NotificationWithState } from '@/domain/notifications';
import type { NewReading } from '@/domain/vitalEntry';
import type { VisitAction } from '@/domain/schedule';
import type { InboxItem } from '@/domain/triage';
import type { RefillDecision, SignOff } from '@/domain/requests';
import { api, byTaskOrder } from './endpoints';
import type {
  BookingRequest,
  CancellationRequest,
  DoseRecordRequest,
  NewThreadRequest,
  PaymentRequest,
  PlanRequest,
  PrecheckRequest,
  RefillRequestInput,
  ReplyRequest,
  RescheduleRequest,
} from './endpoints';
import { queryKeys } from './queryKeys';

export function usePatient(patientId: Id) {
  return useQuery({ queryKey: queryKeys.patient(patientId), queryFn: ({ signal }) => api.patients.get(patientId, { signal }) });
}

export function useClinicians() {
  return useQuery({
    queryKey: queryKeys.clinicians(),
    queryFn: ({ signal }) => api.clinicians.list({ signal }),
    // The directory rarely changes during a session.
    staleTime: 5 * 60_000,
  });
}

export function useCareTeam(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.careTeam(patientId),
    queryFn: ({ signal }) => api.clinicians.careTeam(patientId, { signal }),
  });
}

export function useAppointments(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.appointments(patientId),
    queryFn: ({ signal }) => api.appointments.list(patientId, { signal }),
  });
}

export function useThreads(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.threads(patientId),
    queryFn: ({ signal }) => api.threads.list(patientId, { signal }),
  });
}

export function useLabPanels(patientId: Id) {
  return useQuery({ queryKey: queryKeys.labs(patientId), queryFn: ({ signal }) => api.labs.list(patientId, { signal }) });
}

export function useMedications(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.medications(patientId),
    queryFn: ({ signal }) => api.medications.list(patientId, { signal }),
  });
}

export function useVitals(patientId: Id, kind?: VitalKind) {
  return useQuery({
    queryKey: queryKeys.vitals(patientId, kind),
    queryFn: ({ signal }) => api.vitals.list(patientId, kind, { signal }),
  });
}

export function useHealthRecord(patientId: Id) {
  return useQuery({ queryKey: queryKeys.record(patientId), queryFn: ({ signal }) => api.records.get(patientId, { signal }) });
}

export function useDocuments(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.documents(patientId),
    queryFn: ({ signal }) => api.documents.list(patientId, { signal }),
  });
}

export function useStatements(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.statements(patientId),
    queryFn: ({ signal }) => api.billing.statements(patientId, { signal }),
  });
}

export function useInsurance(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.insurance(patientId),
    queryFn: ({ signal }) => api.billing.insurance(patientId, { signal }),
  });
}

export function useTasks(patientId: Id) {
  return useQuery({ queryKey: queryKeys.tasks(patientId), queryFn: ({ signal }) => api.tasks.list(patientId, { signal }) });
}

/**
 * Ticks a task on or off. The list updates straight away and rolls back if the
 * request fails, then refetches either way so it matches the server.
 */
export function useSetTaskCompleted(patientId: Id) {
  const queryClient = useQueryClient();
  const key = queryKeys.tasks(patientId);

  return useMutation({
    mutationFn: ({ taskId, completed }: { taskId: Id; completed: boolean }) => api.tasks.setCompleted(taskId, completed),
    onMutate: async ({ taskId, completed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PatientTask[]>(key);
      queryClient.setQueryData<PatientTask[]>(key, (tasks) =>
        tasks
          ?.map((task) =>
            task.id === taskId ? { ...task, completedAt: completed ? new Date().toISOString() : undefined } : task,
          )
          .sort(byTaskOrder),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Free slots for a clinician. Kept fresh because other patients book too. */
export function useAvailability(clinicianId: Id | undefined) {
  return useQuery({
    queryKey: queryKeys.availability(clinicianId ?? 'none'),
    queryFn: ({ signal }) => api.availability.list(clinicianId!, { signal }),
    enabled: Boolean(clinicianId),
    staleTime: 15_000,
  });
}

export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BookingRequest) => api.appointments.book(request),
    onSettled: (_data, _error, request) => {
      // Success adds a visit (and maybe a care team member); a conflict means the
      // slots we showed were stale. Refresh both either way.
      void queryClient.invalidateQueries({ queryKey: queryKeys.availability(request.clinicianId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(request.patientId) });
    },
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CancellationRequest) => api.appointments.cancel(request),
    onSettled: (appointment, _error, request) => {
      // A late cancellation also changes the bill, which sits under the patient key.
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(request.patientId) });
      if (appointment) void queryClient.invalidateQueries({ queryKey: queryKeys.availability(appointment.clinicianId) });
    },
  });
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RescheduleRequest) => api.appointments.reschedule(request),
    onSettled: (_appointment, _error, request) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(request.patientId) });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function usePrecheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PrecheckRequest) => api.appointments.precheck(request),
    // Also ticks off the pre-check task, which lives under the patient key.
    onSettled: (_data, _error, request) => queryClient.invalidateQueries({ queryKey: queryKeys.patient(request.patientId) }),
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { patientId: Id; appointmentId: Id }) => api.appointments.checkIn(request),
    onSettled: (_data, _error, request) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments(request.patientId) }),
  });
}

/** Marks a thread read straight away in the cache, so unread badges clear without waiting. */
export function useMarkThreadRead(patientId: Id) {
  const queryClient = useQueryClient();
  const key = queryKeys.threads(patientId);
  return useMutation({
    mutationFn: (threadId: Id) => api.threads.markRead(patientId, threadId),
    onMutate: async (threadId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const readAt = new Date().toISOString();
      queryClient.setQueryData<MessageThread[]>(key, (threads) =>
        threads?.map((t) => (t.id === threadId ? { ...t, patientReadAt: readAt } : t)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useReply(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<ReplyRequest, 'patientId'>) => api.threads.reply({ ...request, patientId }),
    onSuccess: (thread) =>
      queryClient.setQueryData<MessageThread[]>(queryKeys.threads(patientId), (threads) =>
        threads ? [thread, ...threads.filter((t) => t.id !== thread.id)] : threads,
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.threads(patientId) }),
  });
}

export function useCreateThread(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<NewThreadRequest, 'patientId'>) => api.threads.create({ ...request, patientId }),
    // Put the new thread in the list straight away so the page it opens can find it.
    onSuccess: (thread) =>
      queryClient.setQueryData<MessageThread[]>(queryKeys.threads(patientId), (threads) =>
        threads ? [thread, ...threads] : [thread],
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.threads(patientId) }),
  });
}

export function useSetThreadArchived(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, archived }: { threadId: Id; archived: boolean }) =>
      api.threads.setArchived(patientId, threadId, archived),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.threads(patientId) }),
  });
}

/** Marks results as seen. Refreshes everything for the patient, since it can also complete a task. */
export function useMarkResultsViewed(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (panelIds: Id[]) => api.labs.markViewed(patientId, panelIds),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
  });
}

export function useRefillRequests(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.refills(patientId),
    queryFn: ({ signal }) => api.refills.list(patientId, { signal }),
  });
}

export function useRequestRefill(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<RefillRequestInput, 'patientId'>) => api.refills.request({ ...request, patientId }),
    // Also completes a refill task, so refresh everything for the patient.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
  });
}

export function useCancelRefill(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: Id) => api.refills.cancel(patientId, requestId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.refills(patientId) }),
  });
}

export function useDoseLogs(patientId: Id) {
  return useQuery({ queryKey: queryKeys.doses(patientId), queryFn: ({ signal }) => api.doses.list(patientId, { signal }) });
}

/** Records a dose with an optimistic update, so the tick shows at once and rolls back on failure. */
export function useRecordDose(patientId: Id) {
  const queryClient = useQueryClient();
  const key = queryKeys.doses(patientId);
  return useMutation({
    mutationFn: (request: Omit<DoseRecordRequest, 'patientId'>) => api.doses.record({ ...request, patientId }),
    onMutate: async ({ medicationId, scheduledFor, action }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DoseLog[]>(key);
      const same = (l: DoseLog) =>
        l.medicationId === medicationId && new Date(l.scheduledFor).getTime() === new Date(scheduledFor).getTime();
      queryClient.setQueryData<DoseLog[]>(key, (logs = []) => {
        const others = logs.filter((l) => !same(l));
        if (action === 'clear') return others;
        return [
          ...others,
          {
            id: `optimistic-${medicationId}-${scheduledFor}`,
            medicationId,
            scheduledFor,
            skipped: action === 'skipped',
            takenAt: action === 'taken' ? new Date().toISOString() : undefined,
          },
        ];
      });
      return { previous };
    },
    onError: (_error, _request, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useAddReading(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reading: NewReading) => api.vitals.add(patientId, reading),
    // Refreshes vitals everywhere (dashboard tiles too) and the task it may complete.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
  });
}

export function useAddAllergy(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<Allergy, 'substance' | 'reaction' | 'severity'>) => api.records.addAllergy(patientId, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.record(patientId) }),
  });
}

export function usePaymentMethods(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.paymentMethods(patientId),
    queryFn: ({ signal }) => api.billing.methods(patientId, { signal }),
  });
}

export function usePaymentPlans(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.paymentPlans(patientId),
    queryFn: ({ signal }) => api.billing.plans(patientId, { signal }),
  });
}

export function usePayStatement(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<PaymentRequest, 'patientId'>) => api.billing.pay({ ...request, patientId }),
    // Can also complete the payment task, so refresh everything for the patient.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
  });
}

export function useCreatePaymentPlan(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<PlanRequest, 'patientId'>) => api.billing.createPlan({ ...request, patientId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
  });
}

export function useRoster(clinicianId: Id) {
  return useQuery({
    queryKey: queryKeys.roster(clinicianId),
    queryFn: ({ signal }) => api.clinic.roster(clinicianId, { signal }),
  });
}

export function usePatientChart(clinicianId: Id, patientId: Id) {
  return useQuery({
    queryKey: queryKeys.chart(clinicianId, patientId),
    queryFn: ({ signal }) => api.clinic.chart(clinicianId, patientId, { signal }),
  });
}

export function useSchedule(clinicianId: Id, date: string) {
  return useQuery({
    queryKey: queryKeys.schedule(clinicianId, date),
    queryFn: ({ signal }) => api.clinic.schedule(clinicianId, date, { signal }),
  });
}

export function useUpdateVisit(clinicianId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, action }: { appointmentId: Id; action: VisitAction }) =>
      api.clinic.updateVisit({ clinicianId, appointmentId, action }),
    // Status shows on the schedule, the roster's next visit and charts.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.clinic(clinicianId) }),
  });
}

export function useClinicInbox(clinicianId: Id) {
  return useQuery({
    queryKey: queryKeys.inbox(clinicianId),
    queryFn: ({ signal }) => api.clinic.inbox(clinicianId, { signal }),
  });
}

/** Marks a conversation read as soon as it opens, updating the list straight away. */
export function useMarkInboxRead(clinicianId: Id) {
  const queryClient = useQueryClient();
  const key = queryKeys.inbox(clinicianId);
  return useMutation({
    mutationFn: (threadId: Id) => api.clinic.markThreadRead({ clinicianId, threadId }),
    onMutate: (threadId) => {
      const readAt = new Date().toISOString();
      queryClient.setQueryData<InboxItem[]>(key, (items) =>
        items?.map((item) =>
          item.thread.id === threadId ? { ...item, thread: { ...item.thread, clinicianReadAt: readAt } } : item,
        ),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useClinicReply(clinicianId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, body }: { threadId: Id; body: string }) => api.clinic.reply({ clinicianId, threadId, body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox(clinicianId) }),
  });
}

export function useReassignThread(clinicianId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, assigneeId }: { threadId: Id; assigneeId: Id }) =>
      api.clinic.reassign({ clinicianId, threadId, assigneeId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox(clinicianId) }),
  });
}

export function useCloseThread(clinicianId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: Id) => api.clinic.closeThread({ clinicianId, threadId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox(clinicianId) }),
  });
}

export function useClinicRequests(clinicianId: Id) {
  return useQuery({
    queryKey: queryKeys.requests(clinicianId),
    queryFn: ({ signal }) => api.clinic.requests(clinicianId, { signal }),
  });
}

export function useDecideRefill(clinicianId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { requestId: Id } & RefillDecision) => api.clinic.decideRefill({ clinicianId, ...request }),
    // Refills feed the queue, the roster's risk and charts.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.clinic(clinicianId) }),
  });
}

export function useSignOffLab(clinicianId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { panelId: Id } & SignOff) => api.clinic.signOffLab({ clinicianId, ...request }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.clinic(clinicianId) }),
  });
}

export function useNotifications(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.notifications(patientId),
    queryFn: ({ signal }) => api.notifications.list(patientId, { signal }),
    // Reminders become due as time passes, so look again every minute.
    refetchInterval: 60_000,
  });
}

/** Applies a read or dismiss change to the cached list straight away, then refetches. */
function useNotificationChange<T>(patientId: Id, send: (input: T) => Promise<unknown>, apply: (items: NotificationWithState[], input: T) => NotificationWithState[]) {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications(patientId);
  return useMutation({
    mutationFn: send,
    onMutate: async (input: T) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationWithState[]>(key);
      queryClient.setQueryData<NotificationWithState[]>(key, (items) => items && apply(items, input));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useMarkNotificationsRead(patientId: Id) {
  return useNotificationChange(
    patientId,
    (ids: string[]) => api.notifications.markRead(patientId, ids),
    (items, ids) => items.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
  );
}

export function useMarkAllNotificationsRead(patientId: Id) {
  return useNotificationChange(
    patientId,
    () => api.notifications.markAllRead(patientId),
    (items) => items.map((item) => ({ ...item, read: true })),
  );
}

export function useDismissNotification(patientId: Id) {
  return useNotificationChange(
    patientId,
    (id: string) => api.notifications.dismiss(patientId, id),
    (items, id) => items.filter((item) => item.id !== id),
  );
}

export function useReminderPrefs(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.reminders(patientId),
    queryFn: ({ signal }) => api.reminders.get(patientId, { signal }),
  });
}

export function useUpdateReminderPrefs(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Omit<ReminderPrefs, 'patientId'>) => api.reminders.update({ ...prefs, patientId }),
    onSuccess: (prefs) => queryClient.setQueryData(queryKeys.reminders(patientId), prefs),
    // Reminder choices change which notifications show.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications(patientId) }),
  });
}

export function useUpdateContact(patientId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: ContactUpdate) => api.patients.updateContact(patientId, update),
    onSuccess: (patient) => queryClient.setQueryData(queryKeys.patient(patientId), patient),
  });
}

export function useCaregivers(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.caregivers(patientId),
    queryFn: ({ signal }) => api.caregivers.list(patientId, { signal }),
  });
}

function useCaregiverChange<T, R>(patientId: Id, send: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.caregivers(patientId) }),
  });
}

export function useInviteCaregiver(patientId: Id) {
  return useCaregiverChange(patientId, (invite: CaregiverInvite) => api.caregivers.invite(patientId, invite));
}

export function useUpdateCaregiverScopes(patientId: Id) {
  return useCaregiverChange(patientId, ({ grantId, scopes }: { grantId: Id; scopes: CaregiverScope[] }) =>
    api.caregivers.updateScopes(patientId, grantId, scopes),
  );
}

export function useRevokeCaregiver(patientId: Id) {
  return useCaregiverChange(patientId, (grantId: Id) => api.caregivers.revoke(patientId, grantId));
}

export function useConsents(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.consents(patientId),
    queryFn: ({ signal }) => api.privacy.consents(patientId, { signal }),
  });
}

/** Flips a consent straight away and rolls back if saving fails. */
export function useSetConsent(patientId: Id) {
  const queryClient = useQueryClient();
  const key = queryKeys.consents(patientId);
  return useMutation({
    mutationFn: ({ kind, granted }: { kind: ConsentKind; granted: boolean }) => api.privacy.setConsent(patientId, kind, granted),
    onMutate: async ({ kind, granted }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Consent[]>(key);
      queryClient.setQueryData<Consent[]>(key, (consents) => consents?.map((c) => (c.kind === kind ? { ...c, granted } : c)));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useAccessLog(patientId: Id) {
  return useQuery({
    queryKey: queryKeys.accessLog(patientId),
    queryFn: ({ signal }) => api.privacy.accessLog(patientId, { signal }),
  });
}
