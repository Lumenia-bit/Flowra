export interface MediaRule {
  extensions: string[]
  maxSize: number
}

export const mediaRules: Record<string, MediaRule> = {
  photo: { extensions: ['.jpg', '.jpeg', '.png', '.webp'], maxSize: 10 * 1024 * 1024 },
  video: { extensions: ['.mp4', '.mov', '.m4v'], maxSize: 50 * 1024 * 1024 },
  audio: { extensions: ['.mp3', '.m4a', '.wav', '.ogg', '.flac'], maxSize: 50 * 1024 * 1024 },
  voice: { extensions: ['.ogg', '.oga', '.mp3', '.m4a'], maxSize: 50 * 1024 * 1024 },
  document: { extensions: [], maxSize: 50 * 1024 * 1024 }
}

export const mimeTypes: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.json': 'application/json', '.txt': 'text/plain'
}
