
/**
 * WhatsApp Integration Service (Sprint 1)
 * 
 * This service centralizes all calls to the external WhatsApp API.
 * The URL is defined via VITE_WHATSAPP_API_URL.
 */

const API_URL = import.meta.env.VITE_WHATSAPP_API_URL;

const getAuthHeaders = async () => {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': session ? `Bearer ${session.access_token}` : ''
  };
};

export type WhatsAppStatus = 
  | 'DISCONNECTED' 
  | 'INITIALIZING' 
  | 'WAITING_QR' 
  | 'AUTHENTICATING' 
  | 'CONNECTED' 
  | 'RECONNECTING' 
  | 'ERROR';

export interface WhatsAppSessionStatus {
  status: WhatsAppStatus;
  phone?: string;
  name?: string;
  lastConnection?: string;
}

export interface QRCodeResponse {
  qr: string;
}

export const whatsappService = {
  /**
   * Check if the API URL is configured
   */
  isConfigured: () => {
    return !!API_URL;
  },

  /**
   * Get current connection status
   * GET /whatsapp/status
   */
  getStatus: async (): Promise<WhatsAppSessionStatus> => {
    if (!API_URL) throw new Error("WhatsApp API URL not configured");
    
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/whatsapp/status`, { headers });
    if (!response.ok) throw new Error("Failed to fetch WhatsApp status");
    
    return await response.json();
  },

  /**
   * Start a new session or restore existing one
   * POST /whatsapp/session/start
   */
  startSession: async (): Promise<{ ok: boolean }> => {
    if (!API_URL) throw new Error("WhatsApp API URL not configured");
    
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/whatsapp/session/start`, {
      method: 'POST',
      headers
    });
    
    if (!response.ok) throw new Error("Failed to start WhatsApp session");
    return await response.json();
  },

  /**
   * Logout and disconnect session
   * POST /whatsapp/session/logout
   */
  logout: async (): Promise<{ ok: boolean }> => {
    if (!API_URL) throw new Error("WhatsApp API URL not configured");
    
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/whatsapp/session/logout`, {
      method: 'POST',
      headers
    });
    
    if (!response.ok) throw new Error("Failed to logout WhatsApp session");
    return await response.json();
  },

  /**
   * Get current QR Code
   * GET /whatsapp/qr
   */
  getQR: async (): Promise<QRCodeResponse> => {
    if (!API_URL) throw new Error("WhatsApp API URL not configured");
    
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/whatsapp/qr`, { headers });
    if (!response.ok) throw new Error("Failed to fetch WhatsApp QR Code");
    
    return await response.json();
  },

  /**
   * Subscribe to real-time events via SSE
   */
  subscribeToEvents: async (onMessage: (event: string, data: any) => void) => {
    if (!API_URL) return () => {};

    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';

    const eventSource = new EventSource(`${API_URL}/whatsapp/events?token=${token}`);
    
    eventSource.addEventListener('status', (e) => onMessage('status', JSON.parse(e.data)));
    eventSource.addEventListener('qr', (e) => onMessage('qr', JSON.parse(e.data)));
    eventSource.addEventListener('ready', (e) => onMessage('ready', JSON.parse(e.data)));
    eventSource.addEventListener('authenticated', (e) => onMessage('authenticated', JSON.parse(e.data)));
    eventSource.addEventListener('disconnected', (e) => onMessage('disconnected', JSON.parse(e.data)));
    eventSource.addEventListener('error', (e) => onMessage('error', JSON.parse(e.data)));

    return () => eventSource.close();
  }
};
