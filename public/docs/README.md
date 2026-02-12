# Stacky Documentation

This folder contains the documentation for the Stacky project.

## How to update "What's New" on the Login Page

To add a new update (feature or bug fix) that appears on the login page:

1. Open `docs/updates.json`.
2. Add a new entry at the **top** of the array.
3. The schema is:
```json
{
  "date": "YYYY-MM-DD",
  "version": "X.Y.Z",
  "type": "feature" | "bugfix",
  "title": "Short Title",
  "description": "Short description of the change."
}
```
4. The login page automatically displays the latest 2 entries.

## Changelog
See [CHANGELOG.md](./CHANGELOG.md) for a full history of changes.

## Development
- [Firebase Auth Setup](./firebase-auth-setup.md)
- [Data Model](./DATA_MODEL.md)
