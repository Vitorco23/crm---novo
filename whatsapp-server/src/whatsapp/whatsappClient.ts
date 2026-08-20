import { Client, LocalAuth, Events } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';

export type WhatsAppStatus = 
  | 'DISCONNECTED' 
  | 'INITIALIZING' 
  | 'WAITING_QR' 
  | 'AUTHENTICATING' 
  | 'CONNECTED' 
  | 'RECONNECTING' 
  | 'ERROR';

export interface WhatsAppSessionInfo {
  status: WhatsAppStatus;
  phone?: string | null;
  name?: string | null;
  lastConnectedAt?: string | null;
}

class WhatsAppClientManager {
  private client: Client | null = null;
  private status: WhatsAppStatus = 'DISCONNECTED';
  private qrCode: string | null = null;
  private sessionInfo: WhatsAppSessionInfo = {
    status: 'DISCONNECTED',
    phone: null,
    name: null,
    lastConnectedAt: null
  };
  private eventListeners: Set<(event: string, data: any) => void> = new Set();

  constructor() {
    this.checkStoredSession();
  }

  private checkStoredSession() {
    const sessionPath = process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth';
    if (fs.existsSync(sessionPath)) {
      console.log('[WhatsApp] Existing session found, initializing...');
      this.initializeClient();
    }
  }

  public async initializeClient() {
    if (this.client || ['INITIALIZING', 'AUTHENTICATING', 'CONNECTED', 'RECONNECTING'].includes(this.status)) {
      return;
    }

    this.updateStatus('INITIALIZING');
    
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.setupEventListeners();
    
    try {
      await this.client.initialize();
    } catch (error) {
      console.error('[WhatsApp] Initialization error:', error);
      this.updateStatus('ERROR');
    }
  }

  private setupEventListeners() {
    if (!this.client) return;

    this.client.on('qr', async (qr) => {
      console.log('[WhatsApp] QR Received');
      try {
        // Convert QR to Data URL for easier frontend rendering
        this.qrCode = await qrcode.toDataURL(qr);
        this.updateStatus('WAITING_QR');
        this.emit('qr', { qr: this.qrCode });
      } catch (err) {
        console.error('[WhatsApp] QR conversion error:', err);
      }
    });

    this.client.on('authenticated', () => {
      console.log('[WhatsApp] Authenticated');
      this.qrCode = null;
      this.updateStatus('AUTHENTICATING');
    });

    this.client.on('ready', () => {
      console.log('[WhatsApp] Client is ready!');
      const info = this.client?.info;
      this.sessionInfo = {
        status: 'CONNECTED',
        phone: info?.wid.user,
        name: info?.pushname,
        lastConnectedAt: new Date().toISOString()
      };
      this.qrCode = null;
      this.updateStatus('CONNECTED');
    });

    this.client.on('disconnected', async (reason) => {
      console.log('[WhatsApp] Disconnected:', reason);
      this.sessionInfo = {
        status: 'DISCONNECTED',
        phone: null,
        name: null,
        lastConnectedAt: null
      };
      this.qrCode = null;
      this.updateStatus('DISCONNECTED');
      
      // Cleanup
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (error) {
          console.warn("[WhatsApp] Client cleanup failed after disconnect:", error);
        }
        this.client = null;
      }
    });

    this.client.on('change_state', (state) => {
      console.log('[WhatsApp] State changed:', state);
      if (state === 'CONNECTED') {
        this.updateStatus('CONNECTED');
      }
    });
  }

  private updateStatus(status: WhatsAppStatus) {
    this.status = status;
    this.sessionInfo.status = status;
    this.emit('status', this.sessionInfo);
  }

  public getStatus(): WhatsAppSessionInfo {
    return this.sessionInfo;
  }

  public getQR() {
    return { available: !!this.qrCode, qr: this.qrCode };
  }

  public async logout() {
    if (this.client) {
      try {
        await this.client.logout();
        await this.client.destroy();
      } catch (error) {
        console.error('[WhatsApp] Logout error:', error);
      }
      this.client = null;
    }
    
    // Manual cleanup of session folder if necessary
    const sessionPath = process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth';
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (error) {
        console.warn("[WhatsApp] Session directory cleanup failed:", error);
      }
    }

    this.qrCode = null;
    this.updateStatus('DISCONNECTED');
  }

  // SSE Event Support
  public addEventListener(callback: (event: string, data: any) => void) {
    this.eventListeners.add(callback);
    // Send current state immediately
    callback('status', this.sessionInfo);
    if (this.qrCode) callback('qr', { qr: this.qrCode });
  }

  public removeEventListener(callback: (event: string, data: any) => void) {
    this.eventListeners.delete(callback);
  }

  private emit(event: string, data: any) {
    this.eventListeners.forEach(listener => listener(event, data));
  }
}

export const whatsappClientManager = new WhatsAppClientManager();