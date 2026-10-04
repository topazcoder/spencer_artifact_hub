import type { IssuedUploadSession } from '../../uploads/sessions/upload-sessions.types.js';

/**
 * Both ways to finish an upload: a page for the user, and a command for agents with a shell.
 * Either needs the user's own sign-in (their session, or their API token).
 */
export function uploadInstructions(baseUrl: string, { session, token }: IssuedUploadSession) {
  return {
    upload: {
      url: `${baseUrl}/upload/${token}`,
      command: `curl -T "<path to the file>" -H "Authorization: Bearer $ARTIFACT_HUB_TOKEN" -H "X-Filename: <file name>" ${baseUrl}/api/upload-sessions/${token}`,
      expires_at: session.expiresAt.toISOString(),
    },
    next_actions: [
      "If you can run shell commands, the file is on this machine and ARTIFACT_HUB_TOKEN holds the user's API token, run upload.command with the file's path and name.",
      'Otherwise give the user upload.url: they open it signed in and drop the file there. It works once, until upload.expires_at.',
      'Then call get_artifact to confirm the upload.',
    ],
  };
}
