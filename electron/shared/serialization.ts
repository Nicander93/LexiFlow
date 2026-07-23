export function toIpcPayload<T>(value: T): T {
  // Electron cannot structured-clone Vue's reactive proxies. LexiFlow IPC
  // payloads are JSON DTOs, so a JSON round-trip is the clearest boundary.
  return JSON.parse(JSON.stringify(value)) as T;
}
