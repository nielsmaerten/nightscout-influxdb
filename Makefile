# Check if deno is installed
DENO := $(shell command -v deno 2> /dev/null)
SRC = src/ns-to-influxdb.ts
OUT_DIR = dist

# Default target
all: install build

# Install dependencies
install: check-deno
	$(DENO) install

# Compile the project
build: install
	$(DENO) compile --allow-all --output $(OUT_DIR)/ns-to-influxdb $(SRC)

# Remove the output directory and node_modules
clean:
	rm -rf $(OUT_DIR) && rm -rf node_modules

format: install
	deno fmt src/

check: install
	deno fmt --check src/

check-deno:
ifndef DENO
	$(error "deno is not installed. Please install it manually or run 'make install-deno'")
endif

release: check-deno
ifneq ($(shell git status --porcelain),)
	$(error "Working directory is not clean. Please commit or stash your changes.")
endif
	deno run --allow-all npm:bumpp

install-deno:
ifndef DENO
	@echo "Installing deno..."
	@curl -fsSL https://deno.land/install.sh | sh
	@echo "Please restart your shell or run: export PATH=\"$$HOME/.deno/bin:$$PATH\""
else
	@echo "deno is already installed"
endif