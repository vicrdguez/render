{ pkgs, image }:
pkgs.runCommand "tau-docker-image-check" { nativeBuildInputs = [ pkgs.python3 ]; } ''
  python - ${image} ${pkgs.lib.escapeShellArg pkgs.go.GOARCH} <<'PY'
  import json
  import sys
  import tarfile

  with tarfile.open(sys.argv[1]) as archive:
      manifest = json.load(archive.extractfile("manifest.json"))
      assert len(manifest) == 1, manifest
      entry = manifest[0]
      assert entry["RepoTags"] == ["tau:local"], entry
      assert len(entry["Layers"]) > 1, "image must have multiple layers"
      config = json.load(archive.extractfile(entry["Config"]))
      assert config["architecture"] == sys.argv[2], config["architecture"]
      assert config["os"] == "linux", config["os"]
      runtime = config["config"]
      assert runtime["Entrypoint"] == ["/bin/tau"], runtime
      assert runtime["User"] == "1000:1000", runtime
      assert runtime["WorkingDir"] == "/home/tau", runtime
      assert "/home/tau" in runtime["Volumes"], runtime
      env = dict(item.split("=", 1) for item in runtime["Env"])
      assert env["HOME"] == "/home/tau", env
      assert env["SSL_CERT_FILE"] == "/etc/ssl/certs/ca-bundle.crt", env
      assert "/bin" in env["PATH"].split(":"), env

      members = {}
      accounts = {}
      for path in entry["Layers"]:
          with tarfile.open(fileobj=archive.extractfile(path), mode="r|*") as layer:
              for member in layer:
                  name = member.name.removeprefix("./").rstrip("/")
                  members[name] = member
                  if name in ("etc/passwd", "etc/group"):
                      accounts[name] = layer.extractfile(member).read().decode()
                  assert not name.endswith((".tgz", ".tar.gz", "/.package-lock.json")), name
                  assert not any(
                      f"/node_modules/{package}" in f"/{name}/"
                      for package in ("typescript/", "webfox/", "cloudflare/")
                  ), name
      home = members["home/tau"]
      assert home.isdir() and (home.uid, home.gid) == (1000, 1000), home
      assert home.mode & 0o700 == 0o700, oct(home.mode)
      temporary = members["tmp"]
      assert temporary.isdir() and temporary.mode & 0o7777 == 0o1777, temporary
      for path in ("bin/tau", "bin/bash", "bin/node", "etc/ssl/certs/ca-bundle.crt"):
          assert path in members, path
      for path in ("bin/npm", "bin/npx", "bin/tsc", "bin/nix", "bin/git"):
          assert path not in members, path
      assert "tau:x:1000:1000:" in accounts["etc/passwd"], accounts
      assert "tau:x:1000:" in accounts["etc/group"], accounts
  PY
  touch "$out"
''
