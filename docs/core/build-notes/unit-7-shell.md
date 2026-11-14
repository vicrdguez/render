# Build notes: unit 7 shell

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Dev shell package dependency | Keep only the four fast checks in shell `check`, or build the installed package on demand. | Build on demand in shell `verify-build`; pass the executable directly from the app and flake check. | Keeps all five checks in `check` without building the package when the shell opens. The acceptance check retains its package dependency and does not invoke Nix recursively. |
