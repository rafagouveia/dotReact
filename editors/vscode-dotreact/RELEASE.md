# VS Code Marketplace release

## One-time publisher setup

1. Create or claim the `rafagouveia` publisher in the Visual Studio Marketplace.
2. Verify that `publisher` in `package.json` matches that Marketplace ID.
3. Create a Microsoft Entra application or managed identity and authorize it as
   a Contributor member of the Marketplace publisher.
4. Add a GitHub Actions federated credential to that identity, restricted to the
   `vscode-marketplace` environment in this repository.
5. Create the protected repository environment `vscode-marketplace`, add the
   non-secret variables `VSCE_AZURE_CLIENT_ID` and `VSCE_AZURE_TENANT_ID`, and
   require a reviewer.

The workflow exchanges GitHub's short-lived OIDC assertion for a Microsoft
Entra token and invokes `vsce --azure-credential`. There is no long-lived PAT or
client secret to rotate or accidentally include in the VSIX.

## Pre-release

Run the `VS Code extension package` workflow manually with `publish=true` and
`channel=pre-release`. The job builds, tests, packages, uploads the VSIX and then
publishes the exact tested artifact.

## Stable release

1. Update `version` and `CHANGELOG.md` in the same pull request.
2. Run all repository gates and merge the reviewed change.
3. Create a `vscode-v<major>.<minor>.<patch>` tag from the release commit.
4. The workflow packages a stable VSIX and publishes it through the protected
   `vscode-marketplace` environment.

Never reuse a version or publish from an uncommitted worktree. Do not weaken the
federated subject, publisher role or protected-environment approval boundary.
