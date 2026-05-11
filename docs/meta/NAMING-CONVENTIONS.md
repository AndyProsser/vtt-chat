# Naming Conventions and Migration Policy

Status: Active
Updated: 2026-05-11

## Purpose

This document defines canonical naming for product-facing UI, implementation files, and migration aliases.

## 1. Product Terminology

Canonical user-facing term:

- Group

Legacy compatibility term:

- Room

Rules:

- Use Group in all new product/UI copy, UI docs, and component names.
- Keep Room only where runtime contracts or locked backend/shared types still use Room.
- Where both appear during migration, document as Group (legacy: Room).
- When audio transport context is relevant, explicitly state: Group maps to a LiveKit Room.

Examples:

- Group Header (legacy alias: RoomHeader)
- Groups Panel (legacy alias: RoomsPanel)
- groupId in UI docs when product-facing; primaryRoomId remains valid in backend/shared compatibility docs.

## 2. State Module Naming (Frontend and Shared)

Do not use Slice in new module/file names unless the artifact is a direct Zustand slice implementation.

Preferred names by responsibility:

- Manager: coordinates workflow and orchestration across UI/store/network boundaries.
- Service: transport or API boundary logic.
- System: cross-feature runtime subsystem with lifecycle behavior.
- Engine: deterministic transformation, projection, or decision logic.
- Store: canonical state container.
- Selector: read-model derivation for store state.

Rules:

- New non-store modules must avoid Slice in filename.
- Hard rule: any existing \*Slice file outside direct Zustand store composition must be renamed in the next refactor cycle.
- If a file owns multiple responsibilities, split it into Manager + Service + Engine as appropriate.

## 3. Component Naming

Canonical component names should align to product terminology and single responsibility.

Examples:

- GroupHeader.tsx (legacy alias accepted during migration: RoomHeader.tsx)
- GroupsPanel.tsx (legacy alias accepted during migration: RoomsPanel.tsx)
- SessionHistoryPanel.tsx for chat history views

## 4. Migration Policy

Migration is compatibility-first.

1. Rename docs first.
2. Introduce compatibility aliases in code as needed.
3. Move imports to canonical names.
4. Remove aliases after coverage and telemetry confidence.

## 5. PR Requirements

For naming migrations:

- Include migration notes in PR description.
- Confirm no behavior change (or explicitly list behavior changes).
- Update affected docs in docs/ui and docs/meta.
- Add or update tests for renamed integration points when paths/symbols change.
- If a non-Zustand \*Slice filename is touched in refactor scope, rename it in the same cycle.

## 6. Quick Reference

- Product/UI: Group
- Runtime compatibility: Room may persist in locked/shared contracts
- Audio mapping reminder: Group maps to LiveKit Room for audio transport/subscription
- New orchestration modules: Manager/Service/System/Engine
- New store files: Store + Selector naming
