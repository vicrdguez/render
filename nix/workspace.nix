{
  pkgs,
  nodejs,
  root,
}:
let
  inherit (pkgs) lib;
  lock = lib.importJSON (root + "/package-lock.json");
  manifests = lib.filterAttrs (
    directory: _: directory != "" && !(lib.hasInfix "node_modules" directory)
  ) lock.packages;
  npmDeps = pkgs.importNpmLock.buildNodeModules {
    npmRoot = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions [
        (root + "/package.json")
        (root + "/package-lock.json")
      ];
    };
    inherit nodejs;
    derivationArgs = {
      postPatch = lib.concatStringsSep "\n" (
        lib.mapAttrsToList (directory: manifest: ''
          mkdir -p "${directory}"
          cp ${pkgs.writeText "workspace-manifest.json" (builtins.toJSON manifest)} "${directory}/package.json"
        '') manifests
      );
      postInstall = "find $out/node_modules -maxdepth 2 -type l \\( -lname '*extensions/*' -o -lname '*core' -o -lname '*e2e' \\) -delete";
    };
  };
  coreManifest = lib.importJSON (root + "/core/package.json");
  runtimePackage = {
    name = "tau-runtime";
    inherit (coreManifest) version;
    private = true;
  }
  // builtins.intersectAttrs {
    dependencies = null;
    optionalDependencies = null;
    peerDependencies = null;
    peerDependenciesMeta = null;
  } coreManifest;
  runtimeRecords = lib.filterAttrs (
    path: record: lib.hasInfix "node_modules/" path && !(record.link or false)
  ) lock.packages;
  runtimeModules =
    assert lib.assertMsg (lock.lockfileVersion == 3) "Tau runtime requires npm lockfile version 3";
    assert lib.assertMsg (lib.all (lib.hasPrefix "node_modules/") (
      builtins.attrNames runtimeRecords
    )) "Tau runtime does not support workspace-local node_modules records";
    pkgs.importNpmLock.buildNodeModules {
      package = runtimePackage;
      packageLock = lock // {
        inherit (runtimePackage) name version;
        packages = runtimeRecords // {
          "" = runtimePackage;
        };
      };
      inherit nodejs;
      derivationArgs = {
        npmInstallFlags = [ "--omit=dev" ];
        preConfigure = ''export PATH="${pkgs.nodejs-slim_24}/bin:$PATH"'';
        installPhase = ''
          mkdir -p "$out"
          mv node_modules "$out/"
          find "$out/node_modules" -name .package-lock.json -delete
        '';
        disallowedRequisites = [ nodejs ];
      };
    };
in
{
  inherit npmDeps runtimeModules;
  linkModules = "node tools/link-node-modules.mjs ${npmDeps}/node_modules";
  extensions = lib.mapAttrs' (
    directory: manifest:
    lib.nameValuePair (lib.removePrefix "extensions/" directory) { inherit directory manifest; }
  ) (lib.filterAttrs (directory: _: lib.hasPrefix "extensions/" directory) manifests);
  validationSource =
    paths:
    lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions (
        map (path: root + "/${path}") (
          [
            "package.json"
            "tsconfig.base.json"
            "tools/link-node-modules.mjs"
            "tools/workspaces.mjs"
            "tools/typecheck.mjs"
            "tools/assets.mjs"
            "tools/tests.mjs"
          ]
          ++ paths
        )
      );
    };
}
