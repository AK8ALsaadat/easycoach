/**
 * The embedded development database (PGlite) runs only under `next dev` / tests
 * when LOCAL_DB_PATH is set. Production builds inline NODE_ENV="production", so this
 * is always false there and every local-only branch is removed from the bundle.
 */
export const localPreview = () =>
  process.env.NODE_ENV !== "production" && Boolean(process.env.LOCAL_DB_PATH);
