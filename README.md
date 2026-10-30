# reverse-eng

Reverse-engineering workspace, analysed with [REA](https://github.com/morluto/rea) and Ghidra.

## Layout

- `targets/` — binaries and apps under analysis. Ignored by Git; keep third-party files out of the repo.
- `notes/` — findings and write-ups.

## Tooling

- REA 6.8.0 (global npm install, MCP registered with Claude Code)
- Ghidra 12.1.4 with JDK 21 in `C:\tools`
