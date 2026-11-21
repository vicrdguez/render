{
  pkgs,
  root,
  tauRuntime,
}:
let
  nodeVersion = "24.22.1";
  platform =
    {
      aarch64-darwin = {
        target = "darwin-arm64";
        sha256 = "89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7";
      };
      aarch64-linux = {
        target = "linux-arm64";
        sha256 = "33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3";
      };
      x86_64-linux = {
        target = "linux-x64";
        sha256 = "eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c";
      };
    }
    .${pkgs.stdenv.hostPlatform.system};
  nodeName = "node-v${nodeVersion}-${platform.target}";
  nodeArchive = pkgs.fetchurl {
    url = "https://nodejs.org/dist/v${nodeVersion}/${nodeName}.tar.gz";
    inherit (platform) sha256;
  };
  license = root + "/LICENSE";
  launchAgent = root + "/deploy/macos/dev.tau.server.plist";
  tarTools = [
    pkgs.gnutar
    pkgs.gzip
  ];
  bundle =
    pkgs.runCommand "tau-standalone-tree-${platform.target}"
      {
        nativeBuildInputs = tarTools ++ [ pkgs.findutils ];
        allowedReferences = [ ];
      }
      ''
        tar -xzf ${nodeArchive} ${nodeName}/bin/node ${nodeName}/LICENSE
        bundle="$out/tau"
        mkdir -p "$bundle/bin" "$bundle/node_modules"
        install -m755 ${nodeName}/bin/node "$bundle/bin/node"
        install -m644 ${nodeName}/LICENSE "$bundle/NODE-LICENSE"
        install -m644 ${license} "$bundle/LICENSE"
        cp -R ${tauRuntime}/lib/tau/core "$bundle/"
        cp -R ${tauRuntime}/lib/tau/node_modules/. "$bundle/node_modules/"
        chmod -R u+w "$bundle/node_modules"
        find "$bundle/node_modules" -type f -perm -u+x -exec \
          sed -i '1s|^#!${pkgs.nodejs-slim_24}/bin/node$|#!/usr/bin/env node|' {} +

        cat > "$bundle/bin/tau" <<'EOF'
        #!/bin/sh
        root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P) || exit 1
        export PATH="$root/bin:$PATH"
        exec "$root/bin/node" "$root/core/dist/src/command/main.js" "$@"
        EOF
        chmod +x "$bundle/bin/tau"
        ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isDarwin ''
          install -m644 ${launchAgent} "$bundle/dev.tau.server.plist"
        ''}
      '';
in
pkgs.runCommand "tau-${platform.target}.tar.gz" { nativeBuildInputs = tarTools; } ''
  tar --sort=name --mtime=@1 --owner=0 --group=0 --numeric-owner --mode=u+w \
    -C ${bundle} -cf - tau | gzip -n > "$out"
''
