"use client";

/**
 * Wrap an <ActionForm>: runs the browser's native checks (required, type=email, file, radio groups) before the
 * server action. React resets uncontrolled fields after a form action, so catching the common mistakes client-side
 * keeps people from retyping. A default-prevented submit makes React skip the action.
 */
export function ValidateFirst({ children }: { children: React.ReactNode }) {
  return (
    <div
      onSubmitCapture={(e) => {
        const form = e.target as HTMLFormElement;
        if (!form.checkValidity()) {
          e.preventDefault();
          form.reportValidity();
        }
      }}
    >
      {children}
    </div>
  );
}
