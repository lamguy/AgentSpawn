# AgentSpawn Makefile

.PHONY: help build test lint tui dev install clean

# Default target
.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "AgentSpawn - Makefile commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the project
	@echo "Building AgentSpawn..."
	@npm run build

test: ## Run tests
	@echo "Running tests..."
	@npm test

lint: ## Run linter
	@echo "Running linter..."
	@npm run lint

typecheck: ## Run TypeScript type checking
	@echo "Running type checker..."
	@npm run typecheck

tui: build ## Build and launch TUI
	@echo "Launching TUI..."
	@node dist/index.js tui

dev: ## Run in watch mode
	@echo "Starting watch mode..."
	@npm run dev

start: build ## Start a new session (usage: make start SESSION=name)
	@node dist/index.js start $(SESSION)

stop: build ## Stop a session (usage: make stop SESSION=name)
	@node dist/index.js stop $(SESSION)

list: build ## List all sessions
	@node dist/index.js list

exec: build ## Execute command in session (usage: make exec SESSION=name CMD="command")
	@node dist/index.js exec $(SESSION) $(CMD)

install: build ## Install globally
	@echo "Installing globally..."
	@npm install -g .

link: ## Link for local development
	@echo "Creating symlink..."
	@npm link

unlink: ## Unlink local development version
	@echo "Removing symlink..."
	@npm unlink -g agentspawn

clean: ## Clean build artifacts
	@echo "Cleaning..."
	@rm -rf dist/
	@rm -rf node_modules/
	@echo "Clean complete"

reinstall: clean ## Clean and reinstall dependencies
	@echo "Reinstalling dependencies..."
	@npm install
	@$(MAKE) build

all: clean build test ## Clean, build, and test

# Quick development shortcuts
t: tui ## Alias for 'make tui'
b: build ## Alias for 'make build'
d: dev ## Alias for 'make dev'
