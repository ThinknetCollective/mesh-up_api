# Contributing to Mesh API

Thank you for your interest in contributing! Mesh API is an open-source project that thrives on community involvement.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/mesh-up_api.git
   cd mesh-up_api
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
5. Start the development server:
   ```bash
   npm run start:dev
   ```

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Run linting and tests:
   ```bash
   npm run lint
   npm test
   ```
4. Commit with a clear message describing your change
5. Push to your fork and open a Pull Request

## Issue Labels

- 🟢 `good first issue` — Great for newcomers
- 🟡 `enhancement` — New features or improvements
- 🔴 `bug` — Something isn't working
- ⭐ `stellar` — Blockchain integration tasks

## Code Style

- Follow the existing ESLint and Prettier configuration
- Write tests for new features
- Keep pull requests focused on a single change

## Drips Wave Contributors

This project participates in [Drips Wave](https://www.drips.network/solutions/wave) funding cycles. Issues tagged for active Waves include complexity ratings that correspond to reward points. Check the current Wave for available tasks.

## Questions?

Open a [Discussion](https://github.com/ThinknetCollective/mesh-up_api/discussions) or comment on an issue — we're happy to help.


## 🚀 API Versioning & Deprecation Policy

To prevent unexpected failures for existing frontend, mobile, and on-chain consumers, `logiquest_api` strictly enforces **URI-based API versioning** (`/v1/...`, `/v2/...`).

### Deprecation Rules & Guidelines
1. **Minimum Notice Period:** Any route or field marked for deprecation must remain functional in its current version for a minimum of **90 days** before removal.
2. **Deprecation Headers:** Deprecated endpoints must emit `Deprecation: true` and `Sunset: <UTC-Date>` HTTP headers conforming to **RFC 8594**.
3. **No In-Place Breaking Changes:** Never modify existing fields or behavior under `/v1/` in a breaking manner. All breaking changes must land under a new major version (e.g., `/v2/`).