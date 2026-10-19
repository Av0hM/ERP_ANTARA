"use client";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            maxWidth: 640,
            margin: "4rem auto",
            padding: 24,
            fontFamily: "sans-serif",
          }}
        >
          <p>ANTARA ERP</p>
          <h1>The workspace could not be displayed</h1>
          <p>
            Check saved records before repeating a change. No error details have
            been exposed.
          </p>
          <button onClick={reset}>Retry</button>{" "}
          <a href="/dashboard">Return to dashboard</a>
        </main>
      </body>
    </html>
  );
}
