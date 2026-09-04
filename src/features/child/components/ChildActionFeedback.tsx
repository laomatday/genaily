interface ChildActionFeedbackProps {
  message: string | null;
  tone?: 'error' | 'success' | 'info';
}

export function childActionError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

export function ChildActionFeedback({
  message,
  tone = 'error',
}: ChildActionFeedbackProps) {
  if (!message) return null;

  return (
    <p
      className={`child-action-feedback is-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {message}
    </p>
  );
}
