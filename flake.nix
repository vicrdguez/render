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
            npmRoot = ./.;
            inherit nodejs;
          };
          nixFiles = flags: ''
            find . -type d \( -name .git -o -name .direnv -o -name .worktrees \
              -o -name node_modules -o -name docs -o -name .agents \) -prune \
              -o -type f -name '*.nix' -exec nixfmt ${flags} {} +
          '';
          commands = {
            fmt = pkgs.writeShellApplication {
              name = "fmt";
              runtimeInputs = [
                pkgs.biome
                pkgs.nixfmt
                pkgs.findutils
              ];
              text = ''
                biome format --write .
                ${nixFiles ""}
              '';
            };
            lint = pkgs.writeShellApplication {
              name = "lint";
              runtimeInputs = [
                pkgs.biome
                pkgs.nixfmt
                pkgs.findutils
              ];
              text = ''
                biome check .
                ${nixFiles "--check"}
              '';
            };
            spikes = pkgs.writeShellApplication {
              name = "spikes";
              runtimeInputs = [ nodejs ];
              text = ''
                export PI_MODULES="${npmDeps}/node_modules/@earendil-works"
                for spike in substrate two-harnesses crash host ext wire; do
                  node "docs/core/spikes/$spike.mjs"
                done
              '';
            };
            check = pkgs.writeShellApplication {
              name = "check";
              runtimeInputs = [
                commands.lint
                commands.spikes
              ];
              text = ''
                lint
                spikes
              '';
            };
          };
          checks = lib.genAttrs [ "lint" "spikes" ] (
            name:
            pkgs.runCommand "tau-${name}"
              {
                nativeBuildInputs = [ commands.${name} ];
                __darwinAllowLocalNetworking = name == "spikes";
              }
              ''
                cd ${self}
                ${name}
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
              if [ -e node_modules ] && [ ! -L node_modules ]; then
                printf '%s\n' 'node_modules is not a symlink. Move it aside before entering the Nix shell.' >&2
                exit 1
              fi
              ln -sfn ${npmDeps}/node_modules node_modules
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
