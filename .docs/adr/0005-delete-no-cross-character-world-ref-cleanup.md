# ADR-0005: Deleting a character does not affect other characters' world info references

Status: accepted

Deleting character CA, which shares world book WA with character CB, does not remove CB's link to WA. The delete dialog offered a "Also clear world info references in remaining characters" option that was removed.

Deleting a character is a scoped destructive action on that character only. Modifying CB's configuration as a side effect of deleting CA is a separate intent with its own confirmation surface. Coupling the two creates unexpected blast radius and violates the principle that deletion of one entity should not silently mutate unrelated entities.

**Scope boundary**: this decision applies to character deletion only. Deleting a world book is a different entity-removal action where the referenced object itself is being destroyed; in that case, warning about bound characters and optionally clearing their references is a distinct, non-analogous feature. See [Delete World Book](../db/features/world-book-delete.md).
