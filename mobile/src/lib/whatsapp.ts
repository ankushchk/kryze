import { apiRequest } from './api';

export interface WhatsAppLinkStatus {
  linked: boolean;
  phone: string | null;
  linkedAt?: string | null;
}

export async function fetchWhatsAppLinkStatus(): Promise<WhatsAppLinkStatus> {
  return await apiRequest('/api/whatsapp/status');
}

export async function sendWhatsAppCode(phoneNumber: string) {
  return await apiRequest('/api/whatsapp/send-code', {
    method: 'POST',
    body: { phoneNumber },
  });
}

export async function linkWhatsApp(phoneNumber: string, code: string) {
  return await apiRequest('/api/whatsapp/link', {
    method: 'POST',
    body: { phoneNumber, code },
  });
}

export async function unlinkWhatsApp() {
  return await apiRequest('/api/whatsapp/unlink', {
    method: 'POST',
  });
}