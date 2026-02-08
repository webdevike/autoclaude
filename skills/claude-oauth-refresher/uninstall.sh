#!/bin/bash
# uninstall.sh - Remove claude-oauth-refresher launchd service

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_LABEL="com.jarvis.claude-oauth-refresher"
PLIST_FILE="${PLIST_LABEL}.plist"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  claude-oauth-refresher uninstaller${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Stop service
echo -e "${BLUE}[1/3]${NC} Stopping launchd service..."
if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
    launchctl unload "$LAUNCHAGENTS_DIR/$PLIST_FILE" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Service unloaded"
else
    echo "  Service not running"
fi
echo ""

# Step 2: Remove plist
echo -e "${BLUE}[2/3]${NC} Removing plist files..."
for f in "$LAUNCHAGENTS_DIR/$PLIST_FILE" "$SCRIPT_DIR/$PLIST_FILE"; do
    if [[ -f "$f" ]]; then
        rm "$f"
        echo -e "${GREEN}✓${NC} Removed $(basename "$f")"
    fi
done
echo ""

# Step 3: Clean logs (optional)
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
echo "Kept: scripts, Claude CLI credentials"
echo "To reinstall: $SCRIPT_DIR/install.sh"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
