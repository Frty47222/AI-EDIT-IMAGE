
export interface ProcessedImage {
  id: string;
  originalName: string;
  originalUrl: string;
  editedUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  selected: boolean;
}

export interface WorkflowConfig {
  prompt: string;
  provider: 'gemini' | 'custom';
  model: string;
  imageSize: '1K' | '2K' | '4K';
  customUrl: string;
  customApiKey: string;
  customModel: string;
  concurrency: number;
}
