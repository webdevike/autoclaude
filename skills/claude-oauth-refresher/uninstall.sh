#!/bin/bash
# uninstall.sh - Remove claude-oauth-refresher scheduled service
# Cross-platform: launchd (macOS) or systemd (Linux)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PLATFORM="linux"
[[ "$OSTYPE" == "darwin"* ]] && PLATFORM="macos"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  claude-oauth-refresher uninstaller${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Stop service
echo -e "${BLUE}[1/3]${NC} Stopping service..."
if [[ "$PLATFORM" == "macos" ]]; then
    PLIST_LABEL="com.jarvis.claude-oauth-refresher"
    PLIST_FILE="${PLIST_LABEL}.plist"
    LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

    if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
        launchctl unload "$LAUNCHAGENTS_DIR/$PLIST_FILE" 2>/dev/null || true
        echo -e "${GREEN}✓${NC} launchd service unloaded"
    else
        echo "  Service not running"
    fi
else
    SERVICE_NAME="claude-oauth-refresher"
    if systemctl --user is-active "${SERVICE_NAME}.timer" &>/dev/null; then
        systemctl --user stop "${SERVICE_NAME}.timer"
        systemctl --user disable "${SERVICE_NAME}.timer"
        echo -e "${GREEN}✓${NC} systemd timer stopped and disabled"
    else
        echo "  Timer not running"
    fi
fi
echo ""

# Step 2: Remove service files
echo -e "${BLUE}[2/3]${NC} Removing service files..."
if [[ "$PLATFORM" == "macos" ]]; then
    for f in "$LAUNCHAGENTS_DIR/$PLIST_FILE" "$SCRIPT_DIR/$PLIST_FILE"; do
        if [[ -f "$f" ]]; then
            rm "$f"
            echo -e "${GREEN}✓${NC} Removed $(basename "$f")"
        fi
    done
else
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    for f in "${SYSTEMD_DIR}/${SERVICE_NAME}.service" "${SYSTEMD_DIR}/${SERVICE_NAME}.timer"; do
        if [[ -f "$f" ]]; then
            rm "$f"
            echo -e "${GREEN}✓${NC} Removed $(basename "$f")"
        fi
    done
    systemctl --user daemon-reload 2>/dev/null || true
fi
echo ""

# Step 3: Clean logs/config (optional)
echo -e "${BLUE}[3/3]${NC} Cleaning up..."
if [[ -d "$SCRIPT_DIR/logs" ]]; then
    read -p "Delete log files? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$SCRIPT_DIR/logs"
        echo -e "${GREEN}✓${NC} Logs deleted"
    else
        echo "  Keeping logs"
    fi
fi

if [[ -f "$SCRIPT_DIR/claude-oauth-refresh-config.json" ]]; then
    read -p "Delete config file? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm "$SCRIPT_DIR/claude-oauth-refresh-config.json"
        echo -e "${GREEN}✓${NC} Config deleted"
    else
        echo "  Keeping config"
    fi
fi
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Uninstall complete!${NC}"
echo ""
echo "Kept: scripts, Claude credentials"
echo "To reinstall: $SCRIPT_DIR/install.sh"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
