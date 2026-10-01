import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const Dependencies = Schema.Record(Schema.String, Schema.String);

const RootManifest = Schema.fromJsonString(
  Schema.Struct({
    catalog: Dependencies,
    overrides: Dependencies,
    packageManager: Schema.String,
    engines: Dependencies,
  }),
);

const PackageManifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    dependencies: Schema.optionalKey(Dependencies),
    devDependencies: Schema.optionalKey(Dependencies),
  }),
);

const Configuration = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));

const TypeScriptConfiguration = Schema.fromJsonString(
  Schema.Struct({ compilerOptions: Schema.Record(Schema.String, Schema.Unknown) }),
);

class StarterBuildError extends Schema.TaggedError<StarterBuildError>()("StarterBuildError", {
  message: Schema.String,
}) {}

/** Package the maintained account example with registry dependencies and no monorepo imports. */
export const buildStarter = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = new URL("../", import.meta.url).pathname;
  const source = path.join(root, "examples/persistence-drizzle-managed");
  const temporary = yield* fs.makeTempDirectoryScoped();
  const destination = path.join(temporary, "yielded-auth-starter");
  const archive = path.join(root, "docs/public/auth-starter.tar.gz");

  const rootManifest = yield* Schema.decodeEffect(RootManifest)(
    yield* fs.readFileString(path.join(root, "package.json")),
  );

  const manifest = yield* Schema.decodeEffect(PackageManifest)(
    yield* fs.readFileString(path.join(source, "package.json")),
  );

  const versions = new Map<string, string>();

  for (const name of yield* fs.readDirectory(path.join(root, "packages"))) {
    const pkg = yield* Schema.decodeEffect(PackageManifest)(
      yield* fs.readFileString(path.join(root, "packages", name, "package.json")),
    );

    versions.set(pkg.name, pkg.version);
  }

  const resolve = Effect.fn("starter.resolveDependencies")(function* (
    dependencies: Readonly<Record<string, string>>,
  ) {
    const result: Record<string, string> = {};

    for (const [name, range] of Object.entries(dependencies)) {
      const version =
        range === "catalog:"
          ? rootManifest.catalog[name]
          : range === "workspace:*"
            ? versions.get(name)
            : range;

      if (version === undefined)
        return yield* StarterBuildError.make({ message: `No release version for ${name}` });
      result[name] = version;
    }

    return result;
  });

  yield* fs.makeDirectory(destination);
  yield* fs.copy(path.join(source, "src"), path.join(destination, "src"));
  yield* fs.copy(path.join(source, "drizzle"), path.join(destination, "drizzle"));
  yield* fs.copy(path.join(root, "examples/shared/account"), path.join(destination, "src/account"));
  yield* fs.makeDirectory(path.join(destination, "scripts"));
  yield* fs.copyFile(
    path.join(root, "scripts/db-generate.ts"),
    path.join(destination, "scripts/db-generate.ts"),
  );

  for (const name of yield* fs.readDirectory(path.join(destination, "src"))) {
    if (!/\.tsx?$/.test(name)) continue;
    const filename = path.join(destination, "src", name);
    const content = yield* fs.readFileString(filename);

    yield* fs.writeFileString(filename, content.replaceAll("../../shared/account/", "./account/"));
  }

  for (const name of ["index.html", "drizzle.config.ts", ".env.example"]) {
    yield* fs.copyFile(path.join(source, name), path.join(destination, name));
  }
  const readme = yield* fs.readFileString(path.join(source, "README.md"));

  yield* fs.writeFileString(
    path.join(destination, "README.md"),
    readme.replaceAll("../shared/account/", "src/account/"),
  );
  const vite = yield* fs.readFileString(path.join(source, "vite.config.ts"));

  yield* fs.writeFileString(
    path.join(destination, "vite.config.ts"),
    vite.replace("../../scripts/db-generate.ts", "scripts/db-generate.ts"),
  );
  yield* fs.copyFile(path.join(root, "LICENSE"), path.join(destination, "LICENSE"));
  yield* fs.writeFileString(
    path.join(destination, ".gitignore"),
    "node_modules/\ndist/\n.data/\n.env\n",
  );
  yield* fs.writeFileString(
    path.join(destination, "package.json"),
    yield* Schema.encodeEffect(Configuration)({
      name: "yielded-auth-starter",
      version: "0.0.0",
      private: true,
      type: "module",
      packageManager: rootManifest.packageManager,
      engines: rootManifest.engines,
      scripts: { build: "vp build", check: "tsc --noEmit -p tsconfig.json" },
      dependencies: yield* resolve(manifest.dependencies ?? {}),
      overrides: yield* resolve(rootManifest.overrides),
      devDependencies: yield* resolve({
        ...manifest.devDependencies,
        "@types/node": "catalog:",
        vite: "catalog:",
      }),
    }),
  );

  const tsconfig = yield* Schema.decodeEffect(TypeScriptConfiguration)(
    yield* fs.readFileString(path.join(root, "tsconfig.base.json")),
  );

  yield* fs.writeFileString(
    path.join(destination, "tsconfig.json"),
    yield* Schema.encodeEffect(Configuration)({
      compilerOptions: {
        ...tsconfig.compilerOptions,
        plugins: undefined,
        lib: ["ES2023", "DOM"],
        jsx: "react-jsx",
      },
      include: ["src", "scripts", "vite.config.ts", "drizzle.config.ts"],
    }),
  );

  const handle = yield* spawner.spawn(
    ChildProcess.make("tar", ["-czf", archive, "-C", temporary, "yielded-auth-starter"], {
      env: { COPYFILE_DISABLE: "1" },
      extendEnv: true,
      stdout: "inherit",
      stderr: "inherit",
    }),
  );

  const exitCode = yield* handle.exitCode;

  if (exitCode !== ChildProcessSpawner.ExitCode(0))
    return yield* StarterBuildError.make({ message: `tar failed with exit code ${exitCode}` });
  yield* Console.log(`Built ${archive}`);
});

if (import.meta.main)
  BunRuntime.runMain(buildStarter.pipe(Effect.scoped, Effect.provide(BunServices.layer)));
