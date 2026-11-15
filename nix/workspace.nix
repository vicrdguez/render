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
in
{
  inherit npmDeps;
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
