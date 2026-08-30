import { apiRequest } from './api';

export type CallReminder = {
  id: string;
  message: string;
  phoneNumber: string;
  scheduledFor: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
  lastError: string | null;
  createdAt: string;
};

export async function fetchCallReminders(): Promise<{ reminders: CallReminder[]; callsEnabled: boolean }> {
  return apiRequest('/api/call-reminders');
}

export async function scheduleCallReminder(input: {
  message: string;
  scheduledFor: Date;
  callConsent: true;
}): Promise<{ reminder: CallReminder }> {
  return apiRequest('/api/call-reminders', {
    method: 'POST',
    body: {
      message: input.message,
      scheduledFor: input.scheduledFor.toISOString(),
      callConsent: input.callConsent,
    },
  });
}

export async function cancelCallReminder(id: string): Promise<void> {
  await apiRequest(`/api/call-reminders/${id}`, { method: 'DELETE' });
}
