/**
 * Google Drive service for MMEX PWA.
 *
 * Manages read/write of the user's `/.mmex/data.mmb` file stored in Google Drive.
 * All requests use the Drive REST API v3 with a Bearer access token obtained via
 * Google Identity Services (no backend required).
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const USERINFO_API = 'https://www.googleapis.com/oauth2/v3/userinfo'

const MMEX_FOLDER_NAME = '.mmex'
const MMEX_DB_FILE_NAME = 'data.mmb'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}

export interface GoogleUserInfo {
  name: string
  email: string
  picture: string
}

async function driveRequest(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const resp = await fetch(url, { ...init, headers })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Drive API ${resp.status}: ${text}`)
  }
  return resp
}

async function listFiles(accessToken: string, query: string): Promise<DriveFile[]> {
  const url =
    `${DRIVE_API}/files` +
    `?q=${encodeURIComponent(query)}` +
    `&fields=${encodeURIComponent('files(id,name,modifiedTime)')}`
  const resp = await driveRequest(url, accessToken)
  const data = (await resp.json()) as { files: DriveFile[] }
  return data.files
}

/** Finds the `.mmex` folder in the root of Google Drive. Returns null if absent. */
async function findMmexFolder(accessToken: string): Promise<string | null> {
  const q = `name='${MMEX_FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`
  const files = await listFiles(accessToken, q)
  return files[0]?.id ?? null
}

/** Finds `data.mmb` inside the given folder. Returns null if absent. */
async function findDbFile(accessToken: string, folderId: string): Promise<DriveFile | null> {
  const q = `name='${MMEX_DB_FILE_NAME}' and '${folderId}' in parents and trashed=false`
  const files = await listFiles(accessToken, q)
  return files[0] ?? null
}

/**
 * Fetches authenticated Google user information from the OAuth2 userinfo endpoint.
 */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const resp = await driveRequest(USERINFO_API, accessToken)
  const data = (await resp.json()) as { name: string; email: string; picture: string }
  return { name: data.name, email: data.email, picture: data.picture }
}

/**
 * Downloads `/.mmex/data.mmb` from the user's Google Drive.
 * Returns the file content as an ArrayBuffer, or null if the file does not exist.
 */
export async function downloadDbFromDrive(accessToken: string): Promise<ArrayBuffer | null> {
  const folderId = await findMmexFolder(accessToken)
  if (!folderId) return null

  const file = await findDbFile(accessToken, folderId)
  if (!file) return null

  const url = `${DRIVE_API}/files/${file.id}?alt=media`
  const resp = await driveRequest(url, accessToken)
  return resp.arrayBuffer()
}

/**
 * Uploads `data.mmb` to `/.mmex/` in the user's Google Drive.
 * Creates the folder and/or file if they do not yet exist.
 */
export async function uploadDbToDrive(accessToken: string, data: ArrayBuffer): Promise<void> {
  // Ensure the .mmex folder exists
  let folderId = await findMmexFolder(accessToken)
  if (!folderId) {
    const resp = await driveRequest(`${DRIVE_API}/files`, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: MMEX_FOLDER_NAME, mimeType: FOLDER_MIME }),
    })
    const folder = (await resp.json()) as { id: string }
    folderId = folder.id
  }

  const existingFile = await findDbFile(accessToken, folderId)

  if (existingFile) {
    // Update content of the existing file
    await driveRequest(`${UPLOAD_API}/files/${existingFile.id}?uploadType=media`, accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    })
  } else {
    // Create a new file using multipart upload
    const metadata = JSON.stringify({ name: MMEX_DB_FILE_NAME, parents: [folderId] })
    const boundary = 'mmex_pwa_multipart_boundary'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const metadataPart =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      metadata +
      delimiter +
      'Content-Type: application/octet-stream\r\n\r\n'

    const encoder = new TextEncoder()
    const metadataBytes = encoder.encode(metadataPart)
    const closingBytes = encoder.encode(closeDelimiter)
    const body = new Uint8Array(metadataBytes.byteLength + data.byteLength + closingBytes.byteLength)
    body.set(metadataBytes, 0)
    body.set(new Uint8Array(data), metadataBytes.byteLength)
    body.set(closingBytes, metadataBytes.byteLength + data.byteLength)

    await driveRequest(`${UPLOAD_API}/files?uploadType=multipart`, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: body.buffer,
    })
  }
}
