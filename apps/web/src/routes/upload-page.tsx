import type { Artifact, UploadSession } from '@artifact-hub/shared';
import { CheckCircle2Icon, Clock3Icon, Link2OffIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { Button } from '@/components/ui/button.tsx';
import { fileProblem } from '@/features/artifacts/file-checks.ts';
import { FileDropZone } from '@/features/artifacts/file-drop-zone.tsx';
import { useAppConfig } from '@/features/config/use-app-config.ts';
import { useUploadSession, useUploadToSession } from '@/features/uploads/use-upload-session.ts';
import { describeError, isApiError } from '@/lib/api/api-error.ts';
import { formatTimeUntil } from '@/lib/format.ts';

/**
 * Where an assistant sends the user to upload a file it can't send itself (an image, a PDF):
 * the upload link from publish_artifact or update_artifact. Works once, for its owner.
 */
export function UploadPage() {
  const { token = '' } = useParams();
  const { data: session, error, refetch } = useUploadSession(token);
  const [uploaded, setUploaded] = useState<Artifact | null>(null);

  if (uploaded) return <Uploaded artifact={uploaded} />;
  if (isApiError(error, 'NOT_FOUND')) {
    return (
      <Outcome icon={<Link2OffIcon />} title="This upload link doesn't work">
        It may be for another account, or mistyped. Ask your assistant for a new one.
      </Outcome>
    );
  }
  if (error) {
    return (
      <div className="h-[60vh]">
        <InlineError error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="h-[60vh]">
        <InlineLoading />
      </div>
    );
  }
  if (session.status === 'expired') {
    return (
      <Outcome icon={<Clock3Icon />} title="This upload link has expired">
        Ask your assistant for a new one.
      </Outcome>
    );
  }
  if (session.status === 'done') {
    return (
      <Outcome icon={<CheckCircle2Icon />} title="Already uploaded">
        The file for “{session.artifact.title}” is in.{' '}
        <Link to={`/artifacts/${session.artifact.id}`} className="underline">
          Open it
        </Link>
        .
      </Outcome>
    );
  }
  return <UploadForm token={token} session={session} onUploaded={setUploaded} />;
}

function UploadForm({
  token,
  session,
  onUploaded,
}: {
  token: string;
  session: UploadSession;
  onUploaded: (artifact: Artifact) => void;
}) {
  const { data: config } = useAppConfig();
  const upload = useUploadToSession(token);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();

  const chooseFile = (chosen: File) => {
    const problem = fileProblem(chosen, config?.maxArtifactBytes);
    setFileError(problem);
    setFile(problem ? null : chosen);
  };

  const submit = () => {
    if (!file) {
      setFileError('Choose a file to upload.');
      return;
    }
    upload.mutate(file, {
      onSuccess: onUploaded,
      // Refused files can be replaced: the link stays usable until it expires.
      onError: (error) => setFileError(describeError(error)),
    });
  };

  const isNew = session.purpose === 'create';
  return (
    <section className="mx-auto grid max-w-xl gap-6 py-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? 'Upload your file' : 'Upload a new version'}
        </h1>
        <p className="text-muted-foreground">
          {isNew
            ? `Your assistant created “${session.artifact.title}”. Add the file to publish it. Only you can see it until you share it.`
            : `It becomes v${session.versionNo} of “${session.artifact.title}”. Earlier versions stay available.`}
        </p>
        {session.changeNote ? (
          <p className="text-sm text-muted-foreground">What changed: {session.changeNote}</p>
        ) : null}
      </div>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FileDropZone
          file={file}
          onFileChange={chooseFile}
          maxBytes={config?.maxArtifactBytes}
          error={fileError}
          disabled={upload.isPending}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            This link works once, and expires {formatTimeUntil(session.expiresAt)}.
          </p>
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function Uploaded({ artifact }: { artifact: Artifact }) {
  return (
    <Outcome icon={<CheckCircle2Icon />} title="Uploaded">
      “{artifact.title}” now has v{artifact.latestVersionNo}. You can return to your conversation.
      <span className="mt-4 block">
        <Button asChild variant="outline">
          <Link to={`/artifacts/${artifact.id}`}>Open it</Link>
        </Button>
      </span>
    </Outcome>
  );
}

function Outcome({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-3 py-24 text-center">
      <span className="text-muted-foreground [&>svg]:size-8" aria-hidden="true">
        {icon}
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="max-w-md text-muted-foreground">{children}</div>
    </section>
  );
}
