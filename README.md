# EmberDesk

A lightweight self-hosted LLM frontend, forked from [SillyTavern](https://github.com/SillyTavern/SillyTavern).

## Goals

- **Simplify** the inherited feature set to focus on core functionality
- **Optimize** performance and reduce complexity
- **Modernize** the technology stack incrementally

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the server
pnpm start
```

The server will start on the configured port (default: 8000). Open your browser and navigate to `http://localhost:8000`.

## Project Structure

```
EmberDesk/
  server.js           # Entry point
  src/                 # Server-side modules
  public/              # Client-side code (HTML, CSS, JS)
  default/             # Default configuration and scaffold files
  data/                # User data directory
  plugins/             # Plugin directory
  docker/              # Docker configuration
```

## Requirements

- Node.js 26.7.0 Current (`>=26.7.0 <27`)

## Acknowledgments

EmberDesk is based on [SillyTavern](https://github.com/SillyTavern/SillyTavern), created by the SillyTavern community. The original project is licensed under AGPL-3.0, and this fork maintains the same license.

## License

AGPL-3.0 -- see [LICENSE](LICENSE) for details.
