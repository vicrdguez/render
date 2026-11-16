{ pkgs, tauRuntime }:
pkgs.dockerTools.buildLayeredImage {
  name = "tau";
  tag = "local";
  contents = [
    tauRuntime
    pkgs.nodejs-slim_24
    pkgs.bash
    pkgs.coreutils
    pkgs.cacert
  ];
  extraCommands = ''
    mkdir -p home/tau tmp etc
    chmod 1777 tmp
    printf 'root:x:0:0:root:/root:/bin/bash\ntau:x:1000:1000:Tau:/home/tau:/bin/bash\n' > etc/passwd
    printf 'root:x:0:\ntau:x:1000:\n' > etc/group
  '';
  fakeRootCommands = ''
    chown 1000:1000 home/tau
  '';
  config = {
    Entrypoint = [ "/bin/tau" ];
    User = "1000:1000";
    WorkingDir = "/home/tau";
    Env = [
      "HOME=/home/tau"
      "PATH=/bin"
      "SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt"
    ];
    Volumes."/home/tau" = { };
  };
}
