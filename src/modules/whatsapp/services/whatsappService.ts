
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

    const headers = await getAuthHeaders();
    const abortController = new AbortController();

    const connect = async () => {
      try {
        const response = await fetch(`${API_URL}/whatsapp/events`, {
          headers,
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = 'message';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              try {
                onMessage(currentEvent, JSON.parse(data));
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error("SSE Error, reconnecting in 5s...", error);
          setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => abortController.abort();
  }
};
