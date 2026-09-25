# Architecture overview

The desktop code follows a ports-and-adapters boundary without introducing a framework for dependency injection. Domain and score modules contain data and invariants. Application services orchestrate ports. UI is an adapter; persistence, hardware, and communication expose replaceable contracts.

Current composition uses an in-memory project repository. Future filesystem persistence and native hardware adapters can be composed at the application boundary without importing them into UI components.

No wire protocol or serialized score format is defined yet. These will be separate versioned specifications after hardware and runtime constraints are known.
