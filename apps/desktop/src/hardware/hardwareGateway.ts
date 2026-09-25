export type HardwareConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export interface HardwareEndpoint { id: string; label: string; deviceKind: string; state: HardwareConnectionState }
export interface HardwareGateway {
  discover(): Promise<HardwareEndpoint[]>;
  connect(endpointId: string): Promise<void>;
  disconnect(endpointId: string): Promise<void>;
}
