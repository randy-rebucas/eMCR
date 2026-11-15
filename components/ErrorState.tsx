import { ErrorView } from './StateView';

/**
 * Full-screen load error with "Try Again" (a detail or form screen with nothing else to show).
 * Same look as every other error state: see components/StateView.tsx. For a record the server
 * says is gone or not this profile's, use UnavailableView instead: retrying can't help there.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorView fill message={message} onRetry={onRetry} />;
}
