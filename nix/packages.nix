{
  pkgs,
  nodejs,
  root,
  workspace,
}:
let
  inherit (pkgs) lib;
in
rec {
  tau = pkgs.stdenvNoCC.mkDerivation {
    pname = "tau";
    version = "0.0.0";
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions (
        map (path: root + "/${path}") [
          "package.json"
          "tsconfig.base.json"
          "tools/link-node-modules.mjs"
          "core/package.json"
          "core/tsconfig.json"
          "core/src"
          "core/test"
        ]
      );
    };
    nativeBuildInputs = [
      nodejs
      pkgs.makeWrapper
    ];
    buildPhase = ''
      runHook preBuild
      ${workspace.linkModules}
      node node_modules/typescript/bin/tsc -b core
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      mkdir -p $out/lib/tau $out/bin
      cp package.json $out/lib/tau/
      mkdir -p "$out/lib/tau/core/dist"
      cp core/package.json "$out/lib/tau/core/"
      cp -R core/dist/src "$out/lib/tau/core/dist/"
      linker="$PWD/tools/link-node-modules.mjs"
      (cd $out/lib/tau && node "$linker" ${workspace.npmDeps}/node_modules)
      makeWrapper ${nodejs}/bin/node $out/bin/tau --add-flags $out/lib/tau/core/dist/src/command/main.js
      runHook postInstall
    '';
  };
  tauRuntime =
    pkgs.runCommand "tau-runtime"
      {
        nativeBuildInputs = [ pkgs.makeWrapper ];
        disallowedRequisites = [
          tau
          workspace.npmDeps
          nodejs
        ];
      }
      ''
        mkdir -p "$out/lib/tau" "$out/bin"
        cp ${tau}/lib/tau/package.json "$out/lib/tau/"
        cp -R ${tau}/lib/tau/core "$out/lib/tau/"
        ln -s ${workspace.runtimeModules}/node_modules "$out/lib/tau/node_modules"
        makeWrapper ${pkgs.nodejs-slim_24}/bin/node "$out/bin/tau" \
          --add-flags "$out/lib/tau/core/dist/src/command/main.js"
      '';
  extensions = lib.mapAttrs (
    name:
    { directory, manifest }:
    pkgs.runCommand "tau-${name}-source" { } (
      ''
        mkdir -p "$out"
        cp -R ${root + "/${directory}/src"}/. "$out/"
      ''
      + lib.concatMapStrings (dependency: ''
        mkdir -p "$out/node_modules/${dirOf dependency}"
        ln -s ${workspace.npmDeps}/node_modules/${dependency} "$out/node_modules/${dependency}"
      '') (builtins.attrNames (removeAttrs (manifest.dependencies or { }) [ "tau" ]))
      + lib.optionalString (name == "webkit") ''
        chmod u+w "$out/native-tools.json"
        printf '%s\n' '${
          builtins.toJSON {
            git = "${pkgs.git}/bin/git";
            curl = "${pkgs.curl}/bin/curl";
          }
        }' > "$out/native-tools.json"
      ''
    )
  ) workspace.extensions;
}
