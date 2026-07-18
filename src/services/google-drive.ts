// Bearer-only Google Drive REST helpers (openspec: cloud-file-sync design.md
// D8). Under the drive.file scope these calls see exactly the files this
// application created -- across devices, since the OAuth client defines "the
// app". No API key, no Picker service, no Google script.

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files'

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
  size?: string
}

export class DriveApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'DriveApiError'
  }
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new DriveApiError(response.status, `Drive API ${response.status}: ${body.slice(0, 200)}`)
  }
  return response
}

/** List app-visible `.mmb` database files, newest first. */
export async function listDatabaseFiles(token: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: "name contains '.mmb' and trashed = false",
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: '25',
  })
  const response = await ensureOk(
    await fetch(`${FILES_ENDPOINT}?${params.toString()}`, { headers: authHeaders(token) }),
  )
  const body = (await response.json()) as { files?: DriveFile[] }
  return body.files ?? []
}

/** Create a new Drive file with the given content; returns its id. */
export async function createDatabaseFile(
  token: string,
  name: string,
  content: ArrayBuffer,
): Promise<DriveFile> {
  const metadata = { name, mimeType: 'application/octet-stream' }
  const boundary = `mmex-${crypto.randomUUID()}`
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  )
  const response = await ensureOk(
    await fetch(`${UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,name,modifiedTime`, {
      method: 'POST',
      headers: authHeaders(token),
      body,
    }),
  )
  return (await response.json()) as DriveFile
}

/** Download a Drive file's bytes (used for keep-remote conflict resolution). */
export async function downloadDatabaseFile(token: string, fileId: string): Promise<ArrayBuffer> {
  const response = await ensureOk(
    await fetch(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: authHeaders(token),
    }),
  )
  return response.arrayBuffer()
}
