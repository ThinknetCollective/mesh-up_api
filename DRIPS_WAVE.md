# Drips Wave Application

## We plan to add issues related to...

We plan to post scoped issues across bug fixes, new features, documentation, and testing. Specifically:

- **New features**: Building core API modules — mesh-nodes (problem discussions), solutions (proposals), metrics (AI quality scoring), users, auth (JWT), and tags. Stellar wallet integration and on-chain reputation tracking.
- **Bug fixes**: Resolving defects as the API matures — validation edge cases, error handling, and API response consistency.
- **Testing**: Unit tests, integration tests, and e2e tests for each module using Jest and Supertest.
- **Documentation**: Swagger/OpenAPI specs, contributor guides, and architecture docs.
- **DevOps**: CI/CD pipelines, Docker setup, and environment configuration.

Each issue will be scoped with clear acceptance criteria and tagged by complexity (easy / medium / hard / stellar) so contributors can pick up work that matches their skill level during sprint cycles.

## These repos are related because...

All three repos form the full-stack Mesh platform — a collaborative problem-solving system with AI-powered quality scoring and on-chain rewards:

- **mesh-up_api**: The primary REST API backend (NestJS/TypeScript) handling problem discussions, solution proposals, user management, and AI quality scoring.
- **thinkmesh-api**: The AI consensus engine that powers backend logic for detecting, evaluating, and ranking solutions through collaborative intelligence.
- **mesh-contract**: The Stellar/Soroban smart contracts for on-chain reputation, token rewards, and transparent fund allocation.

Together they deliver the end-to-end pipeline: users submit problems and solutions via `mesh-up_api`, quality is evaluated by `thinkmesh-api`, and contributions are rewarded on-chain through `mesh-contract`. Issues in one repo often depend on interfaces defined in the others.
