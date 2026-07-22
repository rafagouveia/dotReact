# Private GitHub Packages

DotReact prerelease packages are published in the `rafagouveia` GitHub Packages
namespace. Publishing new immutable versions is manual and disabled by default.

## Package coordinates

- npm: `@rafagouveia/dotreact-*`
- NuGet feed: `https://nuget.pkg.github.com/rafagouveia/index.json`
- npm registry: `https://npm.pkg.github.com`

The repository `.npmrc` maps only the `rafagouveia` scope to GitHub. It
does not contain a token and does not redirect ordinary npm dependencies.

## Validate archives without publishing

From a clean checkout:

```powershell
npm ci
npm run verify
npm run packages:pack
```

The command writes disposable archives below `artifacts/packages/`, which is
ignored by Git. Inspect these archives before every first publication or public
API change.

## Workflow authentication

The repository and packages have the same owner, so the workflow publishes with
the short-lived `GITHUB_TOKEN` created automatically for that run. The job grants
only `contents: read` and `packages: write`; no custom repository secret or
long-lived PAT is required for publication through GitHub Actions.

Never commit a local token to `.npmrc`, NuGet configuration, environment examples,
logs or generated projects.

## Publish manually

Open **Actions → Private packages → Run workflow**. Keep `publish` disabled to
run the complete verification and package inspection path. Enable it only after
the version in every package manifest and `dotnet/Directory.Build.props` has
been intentionally updated.

The workflow publishes npm packages as restricted and NuGet packages to the
personal feed. A version is immutable: do not overwrite an existing
version; increment it and publish a new archive.

## Install from a developer machine

Authenticate npm without writing the token to the repository:

```powershell
npm login --scope=@rafagouveia --auth-type=legacy --registry=https://npm.pkg.github.com
```

Add the private NuGet source to the user-level configuration:

```powershell
dotnet nuget add source --username rafagouveia --password YOUR_CLASSIC_PAT --store-password-in-clear-text --name github-dotreact "https://nuget.pkg.github.com/rafagouveia/index.json"
```

Prefer a credential provider or CI secret over a clear-text local configuration
on shared machines. Consumers need `read:packages` and repository/package access.
For another private repository, grant that repository access on each package's
GitHub **Manage Actions access** page; `packages: read` alone cannot bypass a
package that has not shared access with the consuming repository.

Create a project without cloning the framework repository:

```powershell
npm exec --yes --package=@rafagouveia/dotreact-cli@0.1.3 -- dotreact create my-app --template starter
cd my-app
npm install
npm exec -- dotreact doctor
```

## Cost controls

GitHub Free currently includes a private Packages allowance. Configure a GitHub
budget that stops usage at the included limit, keep the workflow manual, avoid
publishing duplicate prerelease versions, and delete obsolete private versions
after they are no longer referenced. GitHub Actions downloads authenticated with
`GITHUB_TOKEN` do not count against package data transfer, but Actions artifacts
and Packages share storage allowances.
