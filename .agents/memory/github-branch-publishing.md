---
name: Connected GitHub branch publishing
description: How to preserve remote history and publish workspace branches when the GitHub integration is available but no git remote is configured.
---

When a connected GitHub repository has no usable local git remote, publish through the Git Data API: compare local and remote blob trees first, upload only changed blobs, create a tree and commit with the remote branch commit as parent, then create or fast-forward the branch ref.

**Why:** Replacing the remote tree wholesale is risky because the GitHub repository may contain history or files that are not present in the workspace checkout. A tree diff preserves unrelated repository content and keeps the branch fast-forwardable.

**How to apply:** Resolve the repository and target branch through the connected GitHub integration, compare Git blob SHAs (`git ls-tree` locally versus the recursive GitHub tree), refuse to overwrite an existing new branch, and verify the remote ref after publishing. Keep credentials inside the connector; never put them in shell remotes or logs.