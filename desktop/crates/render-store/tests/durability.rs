use render_store::DeviceStore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct Local {
    draft: String,
    outbox: Vec<Vec<u8>>,
}

#[test]
fn drafts_and_original_envelope_bytes_survive_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let local = Local {
        draft: "concern 日本語".into(),
        outbox: vec![vec![0, 13, 10, 255]],
    };
    {
        let store = DeviceStore::open(dir.path()).unwrap();
        assert_eq!(store.load::<Local>().unwrap(), None);
        store.save(&local).unwrap();
    }
    let reopened = DeviceStore::open(dir.path()).unwrap();
    assert_eq!(reopened.load::<Local>().unwrap(), Some(local));
}

#[test]
fn another_window_cannot_overwrite_the_first_windows_drafts() {
    let dir = tempfile::tempdir().unwrap();
    let first = DeviceStore::open(dir.path()).unwrap();
    assert!(DeviceStore::open(dir.path()).is_err());
    drop(first);
    assert!(DeviceStore::open(dir.path()).is_ok());
}

#[test]
fn corrupt_local_state_is_an_error_not_an_empty_workspace() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("device.json"), "{broken").unwrap();
    let store = DeviceStore::open(dir.path()).unwrap();
    assert!(store.load::<Local>().is_err());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("device.json")).unwrap(),
        "{broken"
    );
}

#[test]
fn a_new_save_replaces_the_whole_state() {
    let dir = tempfile::tempdir().unwrap();
    let store = DeviceStore::open(dir.path()).unwrap();
    store
        .save(&Local {
            draft: "old long draft".into(),
            outbox: vec![],
        })
        .unwrap();
    store
        .save(&Local {
            draft: "new".into(),
            outbox: vec![],
        })
        .unwrap();
    assert_eq!(store.load::<Local>().unwrap().unwrap().draft, "new");
}

#[cfg(unix)]
#[test]
fn device_state_is_private_to_the_current_user() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let store = DeviceStore::open(dir.path()).unwrap();
    store.save(&Local::default()).unwrap();
    assert_eq!(
        std::fs::metadata(dir.path().join("device.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
}
