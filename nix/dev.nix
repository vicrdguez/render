{
  pkgs,
  nodejs,
  workspace,
}:
let
  inherit (pkgs) lib;
  enterRoot = ''
    TAU_INVOCATION_DIR="''${TAU_INVOCATION_DIR:-$(pwd -P)}"
    export TAU_INVOCATION_DIR
    while [ ! -f flake.nix ] || [ ! -f package.json ]; do
      if [ "$PWD" = / ]; then
        printf '%s\n' 'Run this command inside the Tau repository.' >&2
        exit 1
      fi
      cd ..
    done
  '';
  nixFiles = flags: ''
    find . -type d \( -name .git -o -path ./.direnv -o -path ./.worktrees \
      -o -name node_modules -o -path ./docs -o -path ./.agents -o -name dist \) -prune \
      -o -type f -name '*.nix' -exec nixfmt ${flags} {} +
  '';
  mkAction =
    name: runtimeInputs: text:
    pkgs.writeShellApplication {
      name = "tau-${name}";
      runtimeInputs = [ nodejs ] ++ runtimeInputs;
      inherit text;
    };
  mkCommand =
    name:
    {
      action,
      beforeLink ? "",
    }:
    pkgs.writeShellApplication {
      inherit name;
      runtimeInputs = [
        nodejs
        pkgs.coreutils
      ];
      text = ''
        ${enterRoot}
        ${beforeLink}
        timeout --kill-after=10s 60s ${pkgs.bash}/bin/bash -c '${workspace.linkModules}'
        exec timeout --kill-after=10s 600s ${lib.getExe action} "$@"
      '';
    };
  selectorHelp = ''
    for argument in "$@"; do
      case "$argument" in
        -*) exec node tools/workspaces.mjs "$@" ;;
      esac
    done
  '';
  typecheck = ''
    node tools/check-lock.mjs
    node tools/check-boundaries.mjs "$@"
    node tools/typecheck.mjs "$@"
    node tools/assets.mjs "$@"
  '';
  lintAction = mkAction "lint" [ pkgs.biome pkgs.nixfmt pkgs.findutils ] ''
    node tools/check-lock.mjs
    node tools/check-boundaries.mjs
    biome check .
    ${nixFiles "--check"}
  '';
  checkoutCommands = lib.mapAttrs mkCommand {
    install-extension.action = mkAction "install-extension" [ pkgs.nix pkgs.git ] ''
      exec node tools/install-extension.mjs '${builtins.toJSON (builtins.attrNames workspace.extensions)}' "$@"
    '';
    fmt.action = mkAction "fmt" [ pkgs.biome pkgs.nixfmt pkgs.findutils ] ''
      biome format --write .
      ${nixFiles ""}
    '';
    lint.action = lintAction;
    typecheck = {
      action = mkAction "typecheck" [ ] typecheck;
      beforeLink = selectorHelp;
    };
    test = {
      action = mkAction "test" [ pkgs.git ] ''
        ${typecheck}
        node tools/tests.mjs "$@"
      '';
      beforeLink = selectorHelp;
    };
  };
  namedTests =
    lib.mapAttrs'
      (
        name: selection:
        lib.nameValuePair "test-${name}" (
          pkgs.writeShellApplication {
            name = "test-${name}";
            text = ''
              usage() {
                printf '%s\n' 'Usage: test-${name}' 'Runs every ${selection} test. Use test <file>... to choose files.'
              }
              if [ "$#" -eq 1 ] && [ "$1" = --help ]; then
                usage
                exit 0
              fi
              if [ "$#" -gt 0 ]; then
                usage >&2
                exit 2
              fi
              exec ${checkoutCommands.test}/bin/test ${selection}
            '';
          }
        )
      )
      (
        lib.genAttrs [ "core" "e2e" "tools" ] lib.id
        // lib.mapAttrs (_: extension: extension.directory) workspace.extensions
      );
  commands = checkoutCommands // namedTests;
in
{
  inherit commands lintAction;
  shell = pkgs.mkShellNoCC {
    packages = [
      nodejs
      pkgs.git
      pkgs.nix
      pkgs.sqlite
      pkgs.biome
      pkgs.nixfmt
    ]
    ++ builtins.attrValues commands;
    shellHook = ''
      (
        ${enterRoot}
        ${workspace.linkModules}
      ) || exit 1
    '';
  };
}
