---
title: Distributed LevelDB
slug: /
---

[LevelDB is an open-source on-disk key-value store](https://github.com/google/leveldb).

Net-level provides shared authenticated network-based access to leveldb instances:

- as scalable and robust as leveldb without in-process limitations.
- adds simple user-based authentication and granular db-level permissions.

## Authentication

Passwords are use as tokens or shared secrets; no encrytion is employed. Suitable for use inside private, secured networks like VPCs between dedicated cloud nodes, but not multi-user systems.

## Disclaimer

Net Level 1.0 should not be considered `enterprise` ready.
