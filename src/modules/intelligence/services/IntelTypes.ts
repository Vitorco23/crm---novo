// Intelligence — tipos do domínio (Refatoração 002).
export interface AttachmentAnalysisInput {
  attachment: { name: string; type: string; dataUrl: string };
  leadContext: string;
}

export interface SuggestICPInput {
  leadContext: string;
  instagramContent?: string;
  websiteContent?: string;
  additionalInfo?: string;
  currentICP: number;
}

export interface SuggestICPOutput {
  suggestedICP: number;
  reasoning: string;
}
