# 🧠 Mesh API

Open-source problem-solving platform with AI-powered quality scoring.

## What is Mesh?

A collaborative platform where communities solve real-world problems through:
- Structured problem discussions (MeshNodes)
- AI-assisted solution evaluation
- Quality-based rankings (not just popularity)
- Open-source implementation tracking

## Tech Stack

- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL + TypeORM
- **AI**: OpenAI GPT-3.5 (optional, with keyword fallback)
- **Auth**: JWT
- **API Docs**: Swagger/OpenAPI

## Quick Start
```bash
git clone https://github.com/yourusername/mesh-api.git
cd mesh-api
npm install
npm run setup
npm run start:dev
```

Visit: http://localhost:3000/api/docs

## Contributing

We welcome contributions! Check our [Issues](https://github.com/yourusername/mesh-api/issues):

- 🟢 **Easy** (`good first issue`) - Perfect for beginners
- 🟡 **Medium** - Core features  
- 🔴 **Hard** - Complex challenges
- ⭐ **Stellar** - Moonshot goals

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Project Structure
```
src/
├── mesh-nodes/     # Problems/discussions
├── solutions/      # Solution proposals
├── metrics/        # Quality scoring system
├── users/          # User management
├── auth/           # Authentication
└── tags/           # Tagging system
```

## License

MIT - Open source, forever.

## Community

- **Issues**: Bug reports & feature requests
- **Discussions**: Questions & ideas
- **Twitter**: @mesh_api (if you have one)

---

**Built with ❤️ by the Mesh community**
