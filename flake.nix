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
          lock = builtins.fromJSON (builtins.readFile ./package-lock.json);
          workspaceManifests = lib.filterAttrs (
            name: _: name != "" && !(lib.hasInfix "node_modules" name)
          ) lock.packages;
          npmRootSrc = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./package.json
              ./package-lock.json
            ];
          };
          sourceFor =
            directories:
            lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions (
                [
                  (lib.fileset.unions (
                    map (name: ./. + "/${name}") (
                      builtins.attrNames (lib.filterAttrs (_: type: type == "regular") (builtins.readDir ./.))
                    )
                  ))
                  ./tools
                ]
                ++ map (directory: lib.fileset.maybeMissing (./. + "/${directory}")) directories
                ++ map (directory: lib.fileset.maybeMissing (./. + "/${directory}/package.json")) (
                  builtins.attrNames workspaceManifests
                )
              );
            };
          npmDeps = pkgs.importNpmLock.buildNodeModules {
            npmRoot = npmRootSrc;
            inherit nodejs;
            derivationArgs = {
              postPatch = lib.concatStringsSep "\n" (
                lib.mapAttrsToList (directory: manifest: ''
                  mkdir -p "${directory}"
                  cp ${pkgs.writeText "workspace-manifest.json" (builtins.toJSON manifest)} "${directory}/package.json"
                '') workspaceManifests
              );
              postInstall = "find $out/node_modules -maxdepth 2 -type l \\( -lname '*extensions/*' -o -lname '*core' -o -lname '*extension-package' -o -lname '*journeys' \\) -delete";
            };
          };
          enterRoot = ''
            TAU_INVOCATION_DIR="$(pwd -P)"
            export TAU_INVOCATION_DIR
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
            install-extension = mkCommand "install-extension" [ pkgs.nix pkgs.git ] ''
              exec node tools/install-extension.mjs '${builtins.toJSON (builtins.attrNames extensions)}' "$@"
            '';
            fmt = mkCommand "fmt" [ pkgs.biome pkgs.nixfmt pkgs.findutils ] ''
              biome format --write .
              ${nixFiles ""}
            '';
            lint = mkCommand "lint" [ pkgs.biome pkgs.nixfmt pkgs.findutils ] ''
              node tools/check-lock.mjs
              node tools/check-boundaries.mjs
              biome check .
              ${nixFiles "--check"}
            '';
            typecheck = mkCommand "typecheck" [ ] ''
              node tools/check-lock.mjs
              node tools/check-boundaries.mjs "$@"
              node tools/typecheck.mjs "$@"
              node tools/assets.mjs "$@"
            '';
            test = mkCommand "test" [ pkgs.git ] ''
              ${commands.typecheck}/bin/typecheck "$@"
              node tools/tests.mjs "$@"
            '';
            spikes = mkCommand "spikes" [ ] ''
              export PI_MODULES="${npmDeps}/node_modules/@earendil-works"
              for spike in substrate two-harnesses crash host ext wire; do
                node "docs/core/spikes/$spike.mjs"
              done
            '';
            verify-build = mkCommand "verify-build" [ pkgs.nix ] ''
              executable="''${1:-}"
              if [ -z "$executable" ]; then
                executable="$(nix build --no-link --print-out-paths .#tau)/bin/tau"
              fi
              shift "$(( $# > 0 ? 1 : 0 ))"
              if [ "$#" -eq 0 ]; then
                outputs=()
                for name in w1 w2 websearch; do
                  outputs+=("$(nix build --no-link --print-out-paths ".#extension-$name")")
                done
                set -- "''${outputs[@]}"
              fi
              node journeys/test/verify-build.ts "$executable" "$@"
            '';
            check = mkCommand "check" [ ] ''
              if [ "$#" -gt 0 ]; then
                exec ${commands.test}/bin/test "$@"
              fi
              ${commands.lint}/bin/lint
              ${commands.test}/bin/test
              ${commands.spikes}/bin/spikes
              ${commands.verify-build}/bin/verify-build
            '';
          };
          checkSpecs = {
            workspace = {
              source = self;
              run = ''
                ${commands.lint}/bin/lint
                node tools/tests.mjs tools
              '';
            };
            core = {
              source = sourceFor [ "core" ];
              run = ''
                node node_modules/typescript/bin/tsc -b core
                node tools/assets.mjs core
                node tools/tests.mjs core
              '';
            };
            extension-package = {
              source = sourceFor [
                "core"
                "extension-package"
              ];
              run = ''
                node node_modules/typescript/bin/tsc -b extension-package
                node tools/assets.mjs extension-package
                node tools/tests.mjs extension-package
              '';
            };
            journeys = {
              source = self;
              run = ''
                node tools/typecheck.mjs journeys
                node tools/assets.mjs extension-package
                node tools/tests.mjs journeys
              '';
            };
            spikes = {
              source = self;
              run = "${commands.spikes}/bin/spikes";
            };
            verify-build = {
              source = sourceFor [ "journeys/test/verify-build.ts" ];
              run = ''
                node journeys/test/verify-build.ts ${tau}/bin/tau ${extensions.w1} ${extensions.w2} ${extensions.websearch}
              '';
            };
          }
          // lib.genAttrs [ "extension-websearch" "extension-w2" "extension-w1" ] (
            name:
            let
              directory = "extensions/${lib.removePrefix "extension-" name}";
            in
            {
              source = sourceFor [
                "core"
                "extension-package"
                directory
              ];
              run = ''
                node node_modules/typescript/bin/tsc -b ${directory}
                node tools/assets.mjs extension-package
                node tools/tests.mjs ${directory}
              '';
            }
          );
          checks = lib.mapAttrs (
            name: spec:
            pkgs.runCommand "tau-${name}"
              {
                nativeBuildInputs = [
                  nodejs
                  pkgs.coreutils
                  pkgs.git
                ];
                __darwinAllowLocalNetworking = true;
                passthru.source = spec.source;
              }
              ''
                cp -R ${spec.source} source
                chmod -R u+w source
                cd source
                ${linkModules}
                ${spec.run}
                touch "$out"
              ''
          ) checkSpecs;
          extensions = lib.genAttrs [ "w1" "w2" "websearch" ] (
            name:
            pkgs.runCommand "tau-extension-${name}" { } ''
              mkdir -p "$out"
              cp -R ${./extensions + "/${name}/src"}/. "$out/"
              ${lib.optionalString (name == "websearch") ''
                mkdir "$out/node_modules"
                ln -s ${npmDeps}/node_modules/webfox "$out/node_modules/webfox"
              ''}
            ''
          );
          tau = pkgs.stdenvNoCC.mkDerivation {
            pname = "tau";
            version = "0.0.0";
            src = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions [
                ./package.json
                ./tsconfig.json
                ./tsconfig.base.json
                ./tools/link-node-modules.mjs
                ./tools/assets.mjs
                ./core
                ./extension-package
              ];
            };
            nativeBuildInputs = [
              nodejs
              pkgs.makeWrapper
            ];
            buildPhase = ''
              runHook preBuild
              node tools/link-node-modules.mjs ${npmDeps}/node_modules
              node node_modules/typescript/bin/tsc -b core extension-package
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p $out/lib/tau $out/bin
              cp package.json $out/lib/tau/
              for directory in core extension-package; do
                mkdir -p "$out/lib/tau/$directory/dist"
                cp "$directory/package.json" "$out/lib/tau/$directory/"
                cp -R "$directory/dist/src" "$out/lib/tau/$directory/dist/"
              done
              linker="$PWD/tools/link-node-modules.mjs"
              (cd $out/lib/tau && node "$linker" ${npmDeps}/node_modules)
              makeWrapper ${nodejs}/bin/node $out/bin/tau --add-flags $out/lib/tau/core/dist/src/command/main.js
              runHook postInstall
            '';
          };
        in
        {
          inherit
            commands
            checks
            tau
            extensions
            ;
          verifyBuildApp = pkgs.writeShellScript "verify-build" ''
            exec ${commands.verify-build}/bin/verify-build ${tau}/bin/tau ${extensions.w1} ${extensions.w2} ${extensions.websearch} "$@"
          '';
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
        // {
          verify-build = {
            type = "app";
            program = "${value.verifyBuildApp}";
          };
          tau = {
            type = "app";
            program = "${value.tau}/bin/tau";
          };
        }
      ) perSystem;
      packages = lib.mapAttrs (
        _: value:
        {
          inherit (value) tau;
          default = value.tau;
        }
        // lib.mapAttrs' (name: output: lib.nameValuePair "extension-${name}" output) value.extensions
      ) perSystem;
      devShells = lib.mapAttrs (_: value: { default = value.shell; }) perSystem;
      checks = lib.mapAttrs (_: value: value.checks) perSystem;
      formatter = lib.mapAttrs (_: value: value.formatter) perSystem;
    };
}
