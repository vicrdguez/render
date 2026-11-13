{
  description = "Tau development tools and acceptance checks";

  inputs.nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      perSystem = lib.genAttrs supportedSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          nodejs = pkgs.nodejs_24;
          npmDeps = pkgs.importNpmLock.buildNodeModules {
            npmRoot = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions [
                ./package.json
                ./package-lock.json
              ];
            };
            inherit nodejs;
          };
          enterRoot = ''
            export TAU_INVOCATION_DIR="$PWD"
            while [ ! -f flake.nix ] || [ ! -f package.json ]; do
              if [ "$PWD" = / ]; then
                printf '%s\n' 'Run this command inside the Tau repository.' >&2
                exit 1
              fi
              cd ..
            done
          '';
          linkModules = ''
            node tools/link-node-modules.mjs ${npmDeps}/node_modules
          '';
          nixFiles = flags: ''
            find . -type d \( -name .git -o -path ./.direnv -o -path ./.worktrees \
              -o -name node_modules -o -path ./docs -o -path ./.agents -o -name dist \) -prune \
              -o -type f -name '*.nix' -exec nixfmt ${flags} {} +
          '';
          mkCommand =
            name: runtimeInputs: text:
            let
              action = pkgs.writeShellApplication {
                name = "tau-${name}";
                runtimeInputs = [ nodejs ] ++ runtimeInputs;
                inherit text;
              };
            in
            pkgs.writeShellApplication {
              inherit name;
              runtimeInputs = [
                nodejs
                pkgs.coreutils
              ];
              text = ''
                ${enterRoot}
                timeout --kill-after=10s 60s ${pkgs.bash}/bin/bash -c '${linkModules}'
                exec timeout --kill-after=10s 600s ${action}/bin/tau-${name} "$@"
              '';
            };
          commands = {
            fmt = mkCommand "fmt" [ pkgs.biome pkgs.nixfmt pkgs.findutils ] ''
              biome format --write .
              ${nixFiles ""}
            '';
            lint = mkCommand "lint" [ pkgs.biome pkgs.nixfmt pkgs.findutils ] ''
              node tools/check-lock.mjs
              biome check .
              ${nixFiles "--check"}
            '';
            typecheck = mkCommand "typecheck" [ ] ''
              node tools/check-lock.mjs
              node tools/check-boundaries.mjs
              node node_modules/typescript/bin/tsc -b
            '';
            test = mkCommand "test" [ ] ''
              ${commands.typecheck}/bin/typecheck
              node tools/tests.mjs "$@"
            '';
            spikes = mkCommand "spikes" [ ] ''
              export PI_MODULES="${npmDeps}/node_modules/@earendil-works"
              for spike in substrate two-harnesses crash host ext wire; do
                node "docs/core/spikes/$spike.mjs"
              done
            '';
            check = mkCommand "check" [ ] ''
              ${commands.lint}/bin/lint
              ${commands.typecheck}/bin/typecheck
              ${commands.test}/bin/test "$@"
              ${commands.spikes}/bin/spikes
            '';
          };
          checks = lib.genAttrs [ "lint" "typecheck" "test" "spikes" ] (
            name:
            pkgs.runCommand "tau-${name}"
              {
                nativeBuildInputs = [ pkgs.coreutils ];
                __darwinAllowLocalNetworking = builtins.elem name [
                  "test"
                  "spikes"
                ];
              }
              ''
                cp -R ${self} source
                chmod -R u+w source
                cd source
                timeout --kill-after=10s 660s ${commands.${name}}/bin/${name}
                touch "$out"
              ''
          );
        in
        {
          inherit commands checks;
          formatter = pkgs.nixfmt;
          shell = pkgs.mkShellNoCC {
            packages = [
              nodejs
              pkgs.git
              pkgs.sqlite
              pkgs.biome
              pkgs.nixfmt
            ]
            ++ builtins.attrValues commands;
            shellHook = ''
              (
                ${enterRoot}
                ${linkModules}
              ) || exit 1
            '';
          };
        }
      );
    in
    {
      apps = lib.mapAttrs (
        _: value:
        lib.mapAttrs (name: command: {
          type = "app";
          program = "${command}/bin/${name}";
        }) value.commands
      ) perSystem;
      devShells = lib.mapAttrs (_: value: { default = value.shell; }) perSystem;
      checks = lib.mapAttrs (_: value: value.checks) perSystem;
      formatter = lib.mapAttrs (_: value: value.formatter) perSystem;
    };
}
