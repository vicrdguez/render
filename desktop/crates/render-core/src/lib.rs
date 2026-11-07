//! Render client core: typed domain model, pure host reducer, read bases, authority readbacks,
//! drafts, outbox and pinning. No IO, no rune, no clock, no wire types.

pub mod client;
pub mod host;
pub mod model;
pub mod policy;

pub use client::*;
pub use host::{HostOutcome, reduce_host};
pub use model::*;
pub use policy::*;
