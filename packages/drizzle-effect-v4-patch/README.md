# @yielded/drizzle-effect-v4-patch

Temporary compatibility patch for Drizzle's Effect integration. The CLI saves a
native Bun patch and runs `bun install`; subsequent installs apply it from your
lockfile. It updates Drizzle's SQL type imports and schema length helper in its
ESM and CommonJS artifacts. Your application's Effect package stays unchanged.

## Apply

Install your application's dependencies first, then run from the workspace that
depends on Drizzle:

```sh
bunx @yielded/drizzle-effect-v4-patch@beta patch
```

Commit `package.json`, `bun.lock` (or `bun.lockb`), and the generated file in
`patches/`. No lifecycle hook or runtime dependency on this CLI is needed.
Use `--dir path/to/workspace` to select another workspace; patch configuration
belongs to the nearest Bun lockfile's directory.

Only `drizzle-orm@1.0.0-rc.5-ab785fc` is verified. Other releases, including RC4,
are rejected. This does not widen Yielded Auth's adapter peer requirements.
The CLI supports Bun projects and refuses to overwrite a conflicting patch.
If installation fails after saving configuration, rerun the command to finish.

## Remove

Before upgrading to a compatible upstream Drizzle release:

```sh
bunx @yielded/drizzle-effect-v4-patch@beta unpatch
```

Then upgrade Drizzle and commit the manifest, lockfile, and patch deletion.
The command removes only this tool's unchanged patch. This package can be retired
once the application's selected Drizzle release works with the Effect version
required by its adapter.
