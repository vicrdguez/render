{
  pkgs,
  nodejs,
  root,
  workspace,
  packages,
  image ? null,
  lintAction,
}:
let
  inherit (pkgs) lib;
  verifiedExtensions = [
    "w1"
    "w2"
    "webkit"
  ];
  verifySource = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/e2e/package.json")
      (root + "/e2e/test/verify-build.ts")
      (root + "/e2e/test/installed-codemode.ts")
    ];
  };
  verifyArguments =
    assert lib.assertMsg (builtins.attrNames packages.extensions == verifiedExtensions)
      "e2e/test/verify-build.ts verifies ${toString verifiedExtensions}; update it and nix/checks.nix for the extensions in package-lock.json";
    "${packages.tau}/bin/tau ${toString (map (name: packages.extensions.${name}) verifiedExtensions)}";
  verifyBuild = pkgs.writeShellApplication {
    name = "verify-build";
    runtimeInputs = [
      nodejs
      pkgs.coreutils
    ];
    text = ''
      if [ "$#" -gt 0 ]; then
        printf '%s\n' 'Usage: verify-build' 'Verifies the installed tau and extension outputs of this flake.' >&2
        exit 2
      fi
      exec timeout --kill-after=10s 600s node ${verifySource}/e2e/test/verify-build.ts ${verifyArguments}
    '';
  };
  mkCheck =
    name: source: run:
    pkgs.runCommand "tau-${name}"
      {
        nativeBuildInputs = [
          nodejs
          pkgs.coreutils
          pkgs.git
        ]
        ++ lib.optional (name == "extension-webkit") pkgs.curl;
        __darwinAllowLocalNetworking = true;
        passthru.source = source;
      }
      ''
        cp -R ${source} source
        chmod -R u+w source
        cd source
        timeout --kill-after=10s 660s ${pkgs.writeShellScript "check-${name}" ''
          set -euo pipefail
          ${run}
        ''}
        touch "$out"
      '';
  validate =
    name: paths: selection:
    mkCheck name (workspace.validationSource paths) ''
      ${workspace.linkModules}
      node tools/typecheck.mjs ${selection}
      node tools/assets.mjs core
      node tools/tests.mjs ${selection}
    '';
  checks = {
    workspace = mkCheck "workspace" root ''
      ${workspace.linkModules}
      ${lib.getExe lintAction}
      node tools/tests.mjs tools
    '';
    core = validate "core" [ "core" ] "core";
    e2e = validate "e2e" (
      [
        "core"
        "e2e"
      ]
      ++ lib.concatMap (extension: [
        "${extension.directory}/package.json"
        "${extension.directory}/src"
      ]) (builtins.attrValues workspace.extensions)
    ) "e2e";
    verify-build = mkCheck "verify-build" verifySource ''
      node e2e/test/verify-build.ts ${verifyArguments}
    '';
    verify-runtime = mkCheck "verify-runtime" verifySource ''
      node e2e/test/verify-build.ts ${packages.tauRuntime}/bin/tau ${
        toString (map (name: packages.extensions.${name}) verifiedExtensions)
      }
    '';
    runtime-content = import ./runtime-check.nix {
      inherit pkgs;
      runtime = packages.tauRuntime;
      excluded = [
        packages.tau
        workspace.npmDeps
        nodejs
      ];
    };
  }
  // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
    docker-image = import ./image-check.nix { inherit pkgs image; };
  }
  // lib.mapAttrs' (
    name: extension:
    lib.nameValuePair "extension-${name}" (
      validate "extension-${name}" [
        "core"
        extension.directory
      ] extension.directory
    )
  ) workspace.extensions;
in
{
  inherit checks verifyBuild;
}
