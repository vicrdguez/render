# Bundled assets

`design/keymap.toml` and `design/ember-tokens.json` are copies of the accepted design inputs in `docs/ui/`. Runtime code reads these bundled copies. The desktop build does not need files outside `desktop/`.

`fonts/` contains Iosevka and Iosevka Etoile v34.9.1. Each family includes Regular, Medium, SemiBold, Bold, and their Italic faces. These are the official split TTF release files, not the Oblique faces. The SIL Open Font License is in `fonts/LICENSE.md`.

Sources are the `PkgTTF-Iosevka-34.9.1.zip` and `PkgTTF-IosevkaEtoile-34.9.1.zip` assets at https://github.com/be5invis/Iosevka/releases/tag/v34.9.1.

`icons/` contains SVGs from `@carbon/icons` 11.90.0. The Apache 2.0 license is in `icons/LICENSE`.

The design tokens credit the Ember palette to Hossam Saraya. Render's token adaptations and provenance are recorded in the accepted design package.
