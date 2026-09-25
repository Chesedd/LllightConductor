export interface Transport {
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  send(payload: Uint8Array): Promise<void>;
  onData(listener: (payload: Uint8Array) => void): () => void;
}
