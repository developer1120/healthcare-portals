import {
  IconCalendarEvent,
  IconMessage2,
  IconPill,
  IconReceipt2,
  IconTestPipe,
  IconVaccine,
  IconVideo,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { NotificationKind } from '@/domain/types';

export const notificationIcons: Record<NotificationKind, Icon> = {
  message: IconMessage2,
  result: IconTestPipe,
  'result-reviewed': IconTestPipe,
  refill: IconPill,
  appointment: IconCalendarEvent,
  'check-in': IconVideo,
  dose: IconPill,
  billing: IconReceipt2,
  immunization: IconVaccine,
};
