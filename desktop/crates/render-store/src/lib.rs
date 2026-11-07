use fs2::FileExt;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

pub struct DeviceStore {
    directory: PathBuf,
    _lock: File,
}

impl DeviceStore {
    pub fn open(directory: impl AsRef<Path>) -> io::Result<Self> {
        let directory = directory.as_ref().to_path_buf();
        fs::create_dir_all(&directory)?;
        let lock = private_file(&directory.join("device.lock"), false)?;
        lock.try_lock_exclusive().map_err(|e| {
            io::Error::new(
                e.kind(),
                format!("another Render window owns this device store: {e}"),
            )
        })?;
        Ok(Self {
            directory,
            _lock: lock,
        })
    }

    pub fn load<T: DeserializeOwned>(&self) -> io::Result<Option<T>> {
        match fs::read(self.directory.join("device.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|e| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("local state cannot be read; the original file is unchanged: {e}"),
                )
            }),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn save<T: Serialize>(&self, value: &T) -> io::Result<()> {
        let bytes = serde_json::to_vec(value).map_err(io::Error::other)?;
        let temporary = self.directory.join("device.json.next");
        let mut file = private_file(&temporary, true)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, self.directory.join("device.json"))?;
        File::open(&self.directory)?.sync_all()
    }
}

fn private_file(path: &Path, truncate: bool) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .create(true)
        .truncate(truncate);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}
