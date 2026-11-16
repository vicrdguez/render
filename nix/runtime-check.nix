{
  pkgs,
  runtime,
  excluded,
}:
let
  closure = pkgs.closureInfo { rootPaths = [ runtime ]; };
in
pkgs.runCommand "tau-runtime-content"
  {
    nativeBuildInputs = [
      pkgs.findutils
      pkgs.gnugrep
    ];
  }
  ''
    for forbidden in ${pkgs.lib.escapeShellArgs (map toString excluded)}; do
      if grep -Fx "$forbidden" ${closure}/store-paths; then
        echo "Runtime closure retains $forbidden" >&2
        exit 1
      fi
    done
    if grep -E '\.(tgz|tar\.gz)$' ${closure}/store-paths; then
      echo 'Runtime closure retains dependency archives' >&2
      exit 1
    fi
    find -L ${runtime} \( \
      -name .package-lock.json -o -name '*.tgz' -o -name '*.tar.gz' -o \
      -path '*/node_modules/typescript' -o -path '*/node_modules/webfox' -o \
      -path '*/node_modules/cloudflare' \
    \) -print > forbidden-files
    if test -s forbidden-files; then
      cat forbidden-files >&2
      echo 'Runtime contains development or unrelated dependency files' >&2
      exit 1
    fi
    test -x ${runtime}/bin/tau
    test -f ${runtime}/lib/tau/core/dist/src/command/main.js
    touch "$out"
  ''
