{
  pkgs,
  tau,
  plist,
}:
pkgs.writeShellApplication {
  name = "install-launchagent";
  runtimeInputs = [
    pkgs.coreutils
    pkgs.nix
  ];
  text = ''
    usage='Usage: nix run .#install-launchagent [-- --help]'
    if [[ $# -ne 0 ]]; then
      if [[ $# -eq 1 && $1 == --help ]]; then
        printf '%s\n' "$usage"
        exit 0
      fi
      printf '%s\n' "$usage" >&2
      exit 2
    fi

    template=${pkgs.lib.escapeShellArg "${plist}"}
    label=$(/usr/bin/plutil -extract Label raw -o - "$template")
    domain="gui/$(id -u)"
    service="$domain/$label"
    profile="''${XDG_STATE_HOME:-$HOME/.local/state}/nix/profiles/tau-launchagent"
    installed="$HOME/Library/LaunchAgents/$label.plist"

    if ! /bin/launchctl print "$domain" >/dev/null 2>&1; then
      printf 'Cannot access %s. Run the installer as the logged-in macOS user.\n' "$domain" >&2
      exit 1
    fi

    loaded=false
    if /bin/launchctl print "$service" >/dev/null 2>&1; then
      loaded=true
    elif timeout 1 "${tau}/bin/tau" device list >/dev/null 2>&1; then
      printf 'Tau is already running. Stop the manually started Tau server and rerun the installer.\n' >&2
      exit 1
    fi

    mkdir -p "$(dirname "$profile")" "$(dirname "$installed")"
    staged=$(mktemp "$installed.XXXXXX")
    trap 'rm -f "$staged"' EXIT
    cp "$template" "$staged"
    /usr/bin/plutil -remove ProgramArguments.0 "$staged"
    /usr/bin/plutil -insert ProgramArguments.0 -string "$profile/bin/tau" "$staged"
    nix-env --profile "$profile" --set ${pkgs.lib.escapeShellArg (toString tau)}

    if [[ $loaded == true ]]; then
      /bin/launchctl bootout "$service"
      for ((attempt = 0; attempt < 50; attempt++)); do
        if ! /bin/launchctl print "$service" >/dev/null 2>&1; then
          break
        fi
        sleep 0.2
      done
      if /bin/launchctl print "$service" >/dev/null 2>&1; then
        printf 'LaunchAgent %s did not stop. Inspect it with /bin/launchctl print %s.\n' "$service" "$service" >&2
        exit 1
      fi
    fi
    mv -f "$staged" "$installed"
    /bin/launchctl bootstrap "$domain" "$installed"

    for ((attempt = 0; attempt < 30; attempt++)); do
      if timeout 1 "$profile/bin/tau" device list >/dev/null 2>&1; then
        printf 'Tau is ready. LaunchAgent: %s\n' "$service"
        exit 0
      fi
      sleep 1
    done
    printf 'Tau did not become ready. Inspect the LaunchAgent with /bin/launchctl print %s.\n' "$service" >&2
    exit 1
  '';
}
