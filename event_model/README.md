# Event Model

This directory is the canonical source for the Anything event model. YAML files under
`event_model/workflows/` are source artifacts. Rendered diagrams or swim lanes can be
generated later, but generated views are not authoritative.

The initial package is the `bootstrap workflow package`: a set of vertical slices that
model the defect-driven loop used to evolve Anything itself.

The artifact schema, glossary, slice type contracts, field source syntax, aggregate
state evolution rules, scenario schema, component references, memory references, and
event compatibility rules are documented in `event_model/schema.md`.
