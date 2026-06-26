export interface AsrServerMessage {
  session_id?: string;
  text?: string;
  speaker?: string | null;
  is_final?: boolean;
  mode?: string;
}

export interface BrowserAsrSessionOptions {
  websocketUrl: string;
  mode?: string;
  onOpen?: () => void;
  onPartial?: (message: AsrServerMessage) => void;
  onFinal?: (message: AsrServerMessage) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface StopAsrOptions {
  sendFlush?: boolean;
}
