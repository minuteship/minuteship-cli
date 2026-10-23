/** Parse resource ids out of Wrangler CLI output. */
export function parseD1DatabaseId(output: string): string | undefined {
  return (
    output.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ??
    output.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ??
    output.match(/database_id:\s*"?([0-9a-f-]{32,36})"?/i)?.[1]
  );
}

/**
 * Wrangler must be invoked with `--json` here: a bare 32-hex fallback would
 * happily match the Cloudflare account id printed in the same output.
 */
export function parseKvNamespaceId(output: string): string | undefined {
  return (
    output.match(/"id"\s*:\s*"([0-9a-f]{32})"/i)?.[1] ??
    output.match(/id\s*=\s*"([0-9a-f]{32})"/i)?.[1]
  );
}

export function parseR2BucketName(output: string, fallback: string): string {
  return (
    output.match(/"bucket_name"\s*:\s*"([^"]+)"/)?.[1] ??
    output.match(/bucket_name\s*=\s*"([^"]+)"/)?.[1] ??
    fallback
  );
}

/** Extract the useful part of a wrangler error for logs. */
export function summarizeCommandError(stderr: string): string {
  const line = stderr
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  return line ? line.replace(/\s+/g, ' ').slice(0, 200) : 'unknown error';
}
