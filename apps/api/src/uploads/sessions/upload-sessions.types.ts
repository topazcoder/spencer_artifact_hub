import type { UploadSession } from './upload-session.entity.js';

export interface IssuedUploadSession {
  session: UploadSession;
  /** For the upload URL. Returned once; only its hash is stored. */
  token: string;
}
