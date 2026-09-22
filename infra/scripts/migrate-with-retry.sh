#!/bin/sh

set -u

MAX_ATTEMPTS=5
DELAY_SECONDS=8
ATTEMPT=1

echo "Running production Prisma migrations..."

while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
  echo ""
  echo "Migration attempt $ATTEMPT/$MAX_ATTEMPTS"

  LOG_FILE="$(mktemp)"

  npx prisma migrate deploy \
    --schema apps/api/prisma/schema.prisma \
    >"$LOG_FILE" 2>&1

  EXIT_CODE=$?

  cat "$LOG_FILE"

  if [ "$EXIT_CODE" -eq 0 ]; then
    rm -f "$LOG_FILE"

    echo ""
    echo "Prisma migrations completed successfully."
    exit 0
  fi

  if grep -q "P1002" "$LOG_FILE" || \
     grep -qi "advisory lock" "$LOG_FILE"; then

    rm -f "$LOG_FILE"

    if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
      echo ""
      echo "Migration failed: advisory lock unavailable after $MAX_ATTEMPTS attempts."
      exit 1
    fi

    echo ""
    echo "Prisma advisory lock unavailable."
    echo "Retrying in ${DELAY_SECONDS}s..."

    sleep "$DELAY_SECONDS"

    ATTEMPT=$((ATTEMPT + 1))
    continue
  fi

  rm -f "$LOG_FILE"

  echo ""
  echo "Migration failed with a non-retryable error."
  echo "Prisma exit code: $EXIT_CODE"

  exit "$EXIT_CODE"
done

exit 1