// Local type shim for opfs-cloud-file@0.1.5, which ships empty declaration
// files (dist/index.d.ts is `export {}`) and an exports map without a "types"
// condition -- so TypeScript cannot resolve any declarations (upstream
// packaging bug, recorded in the openspec change). tsconfig maps the bare
// specifier here via `paths`; Vite resolves the runtime module independently.
// Shapes were extracted from the shipped ESM bundle and README and cover only
// what this application uses. Delete when an upstream release ships real types.

export interface GoogleDriveProviderConfig {
  fileId: string
  accessToken: string
}

export interface OpfsCloudFileConfig {
  type: 'google-drive-v2' | 'google-drive-v3'
  /** OPFS path of the local file to keep in sync. */
  opfsPath: string
  provider: { config: GoogleDriveProviderConfig }
  pollingInterval?: number
  maxRetries?: number
  retryDelayMs?: number
  backoffMultiplier?: number
  retryableErrors?: Array<number | 'network'>
}

export interface ConflictDetail {
  localChecksum: string
  remoteChecksum: string
  localTimestamp: number
  remoteTimestamp: number
  fileName: string
}

export class OpfsCloudFile extends EventTarget {
  constructor(config: OpfsCloudFileConfig)
  sync(): Promise<void>
  stop(): void
  dispose(): void
}
