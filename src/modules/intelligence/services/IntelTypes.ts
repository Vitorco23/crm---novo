// Intelligence — tipos do domínio (Refatoração 002).
export interface AttachmentAnalysisInput {
  attachment: { name: string; type: string; dataUrl: string };
  leadContext: string;
}
