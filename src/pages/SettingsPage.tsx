import { useRequiredSession } from '@/auth/session';
import { ReminderSettings } from '@/features/notifications/ReminderSettings';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';
import { Card } from '@/ui';

export function SettingsPage() {
  const { role } = useRequiredSession();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card title="Appearance" description="Choose a theme, or follow your device setting.">
        <ThemeSwitcher />
      </Card>
      {role === 'patient' && <ReminderSettings />}
    </div>
  );
}
