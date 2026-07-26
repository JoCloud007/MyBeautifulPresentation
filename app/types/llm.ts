export interface LlmConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  done: boolean;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: LlmMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response?: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
}
