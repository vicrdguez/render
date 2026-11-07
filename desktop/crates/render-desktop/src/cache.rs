//! Private device-cache encoding of last observed host facts, not a production wire DTO.
//! IO belongs to render-store. A cached view is readable history, never live authority.

use render_core::{Connection, HostSnapshot};
use serde::{Deserialize, Serialize};

/// Last observed facts. Restore through this boundary, separately from device-local state.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CachedHost {
    host: HostSnapshot,
}

impl CachedHost {
    pub fn capture(host: &HostSnapshot) -> Self {
        Self { host: host.clone() }
    }

    /// No wall-clock inference: scope observations must be refreshed by host snapshots.
    /// Cursor host times remain observations for display, not running clocks.
    pub fn restore(self) -> HostSnapshot {
        let mut host = self.host;
        host.needs_snapshot.extend(host.cursors.keys().cloned());
        host.host_time = None;
        if matches!(host.connection, Connection::Live | Connection::Connecting) {
            host.connection = Connection::Offline {
                since: None,
                reason: Some("Showing cached host facts; reconnect to refresh".into()),
            };
        }
        host
    }
}
