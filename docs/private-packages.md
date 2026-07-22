# Private GitHub Packages

DotReact prerelease packages are prepared for the `BlackRedSolutionsTeam`
GitHub Packages namespace. Publishing is manual and disabled by default.

## Package coordinates

- npm: `@blackredsolutionsteam/dotreact-*`
- NuGet feed: `https://nuget.pkg.github.com/BlackRedSolutionsTeam/index.json`
- npm registry: `https://npm.pkg.github.com`

The repository `.npmrc` maps only the Black Red Solutions scope to GitHub. It
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

## Repository secret

Because this repository currently belongs to `rafagouveia` while the packages
belong to `BlackRedSolutionsTeam`, the repository `GITHUB_TOKEN` must not be
assumed to have cross-owner package permissions. Create an organization-approved
classic personal access token with `read:packages` and `write:packages` (and
`repo` while this repository is private), authorize it for organization SSO when
required, and save it as the repository Actions secret
`BLACKRED_PACKAGES_TOKEN`.

Never commit this token to `.npmrc`, NuGet configuration, environment examples,
logs or generated projects.

## Publish manually

Open **Actions → Private packages → Run workflow**. Keep `publish` disabled to
run the complete verification and package inspection path. Enable it only after
the version in every package manifest and `dotnet/Directory.Build.props` has
been intentionally updated.

The workflow publishes npm packages as restricted and NuGet packages to the
organization feed. A version is immutable: do not overwrite an existing
version; increment it and publish a new archive.

## Install from a developer machine

Authenticate npm without writing the token to the repository:

```powershell
npm login --scope=@blackredsolutionsteam --auth-type=legacy --registry=https://npm.pkg.github.com
```

Add the private NuGet source to the user-level configuration:

```powershell
dotnet nuget add source --username YOUR_GITHUB_USER --password YOUR_CLASSIC_PAT --store-password-in-clear-text --name BlackRedGitHub "https://nuget.pkg.github.com/BlackRedSolutionsTeam/index.json"
```

Prefer a credential provider or CI secret over a clear-text local configuration
on shared machines. Consumers need `read:packages` and repository/package access.

## Cost controls

GitHub Free currently includes a private Packages allowance. Configure a GitHub
budget that stops usage at the included limit, keep the workflow manual, avoid
publishing duplicate prerelease versions, and delete obsolete private versions
after they are no longer referenced. GitHub Actions downloads authenticated with
`GITHUB_TOKEN` do not count against package data transfer, but Actions artifacts
and Packages share storage allowances.
