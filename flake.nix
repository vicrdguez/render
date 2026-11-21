{
  description = "Tau development tools and acceptance checks";

  inputs.nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0";

  outputs =
    { nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;
      root = ./.;
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
          workspace = import ./nix/workspace.nix { inherit pkgs nodejs root; };
          packages = import ./nix/packages.nix {
            inherit
              pkgs
              nodejs
              root
              workspace
              ;
          };
          standalone = import ./nix/standalone.nix {
            inherit pkgs root;
            inherit (packages) tauRuntime;
          };
          image =
            if pkgs.stdenv.hostPlatform.isLinux then
              import ./nix/image.nix {
                inherit pkgs;
                inherit (packages) tauRuntime;
              }
            else
              null;
          dev = import ./nix/dev.nix { inherit pkgs nodejs workspace; };
          validation = import ./nix/checks.nix {
            inherit
              pkgs
              nodejs
              root
              workspace
              packages
              image
              ;
            inherit (dev) lintAction;
          };
        in
        {
          inherit
            pkgs
            packages
            standalone
            image
            dev
            validation
            ;
        }
      );
      app = program: {
        type = "app";
        inherit program;
      };
    in
    {
      apps = lib.mapAttrs (
        _: value:
        lib.mapAttrs (name: command: app "${command}/bin/${name}") value.dev.commands
        // {
          tau = app "${value.packages.tau}/bin/tau";
          verify-build = app (lib.getExe value.validation.verifyBuild);
        }
        // lib.optionalAttrs value.pkgs.stdenv.hostPlatform.isDarwin {
          install-launchagent = app (
            lib.getExe (
              import ./nix/launchagent.nix {
                inherit (value) pkgs;
                inherit (value.packages) tau;
                plist = root + "/deploy/macos/dev.tau.server.plist";
              }
            )
          );
        }
      ) perSystem;
      packages = lib.mapAttrs (
        _: value:
        {
          inherit (value.packages) tau;
          inherit (value) standalone;
          default = value.packages.tau;
        }
        // lib.mapAttrs' (name: lib.nameValuePair "extension-${name}") value.packages.extensions
        // lib.optionalAttrs value.pkgs.stdenv.hostPlatform.isLinux {
          docker-image = value.image;
        }
      ) perSystem;
      devShells = lib.mapAttrs (_: value: { default = value.dev.shell; }) perSystem;
      checks = lib.mapAttrs (
        _: value:
        value.validation.checks
        // {
          standalone-archive = value.standalone;
        }
      ) perSystem;
      formatter = lib.mapAttrs (_: value: value.pkgs.nixfmt) perSystem;
    };
}
