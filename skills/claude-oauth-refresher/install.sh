#!/bin/bash
# install.sh - One-time setup for claude-oauth-refresher (autoclaude/jarvis)
# Sets up launchd to refresh Claude OAuth tokens every 2 hours

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/claude-oauth-refresh-config.json"
PLIST_LABEL="com.jarvis.claude-oauth-refresher"
PLIST_FILE="${PLIST_LABEL}.plist"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  claude-oauth-refresher installer${NC}"
echo -e "${BLUE}  (for autoclaude/jarvis)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Sets up automatic Claude OAuth token refresh every 2 hours.${NC}"
echo -e "${CYAN}Notifications sent via your Telegram bot.${NC}"
echo ""

# Step 1: Verify setup
echo -e "${BLUE}[1/6]${NC} Running verification..."
if "$SCRIPT_DIR/verify-setup.sh"; then
    echo ""
else
    echo ""
    echo -e "${RED}Verification failed. Fix the errors above first.${NC}"
    exit 1
fi

# Step 2: Config
echo -e "${BLUE}[2/6]${NC} Setting up config..."

# Auto-detect Telegram from project .env
DETECTED_TOKEN=""
DETECTED_CHAT=""
if [[ -f "$PROJECT_DIR/.env" ]]; then
    DETECTED_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
    DETECTED_CHAT=$(grep -E "^TELEGRAM_ALLOWED_USERS=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- | cut -d, -f1 || true)
    if [[ -n "$DETECTED_TOKEN" ]] && [[ -n "$DETECTED_CHAT" ]]; then
        echo -e "${GREEN}✓${NC} Auto-detected Telegram config from .env"
        echo "  Chat ID: $DETECTED_CHAT"
    fi
fi

CREATE_NEW_CONFIG=""
if [[ -f "$CONFIG_FILE" ]]; then
    echo -e "${YELLOW}⚠${NC} Config already exists"
    read -p "Overwrite with new config? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        CREATE_NEW_CONFIG=true
    else
        echo "Keeping existing config"
    fi
else
    CREATE_NEW_CONFIG=true
fi

if [[ "$CREATE_NEW_CONFIG" == "true" ]]; then
    echo ""
    echo -e "${CYAN}Configure Notifications:${NC}"
    echo -e "${YELLOW}Tip:${NC} Keep all enabled initially to verify it works."
    echo ""

    read -p "Enable start notification? [Y/n] " -n 1 -r NOTIFY_START_INPUT
    echo ""
    [[ $NOTIFY_START_INPUT =~ ^[Nn]$ ]] && NOTIFY_START="false" || NOTIFY_START="true"

    read -p "Enable success notification? [Y/n] " -n 1 -r NOTIFY_SUCCESS_INPUT
    echo ""
    [[ $NOTIFY_SUCCESS_INPUT =~ ^[Nn]$ ]] && NOTIFY_SUCCESS="false" || NOTIFY_SUCCESS="true"

    read -p "Enable failure notification? [Y/n] " -n 1 -r NOTIFY_FAILURE_INPUT
    echo ""
    [[ $NOTIFY_FAILURE_INPUT =~ ^[Nn]$ ]] && NOTIFY_FAILURE="false" || NOTIFY_FAILURE="true"

    cat > "$CONFIG_FILE" << EOF
{
  "refresh_buffer_minutes": 30,
  "log_file": "$SCRIPT_DIR/logs/claude-oauth-refresh.log",
  "notifications": {
    "on_start": $NOTIFY_START,
    "on_success": $NOTIFY_SUCCESS,
    "on_failure": $NOTIFY_FAILURE
  },
  "telegram_bot_token": "${DETECTED_TOKEN}",
  "telegram_chat_id": "${DETECTED_CHAT}"
}
EOF
    echo -e "${GREEN}✓${NC} Config created"
fi
echo ""

# Step 3: Test refresh
echo -e "${BLUE}[3/6]${NC} Testing token refresh..."
chmod +x "$SCRIPT_DIR"/*.sh
if "$SCRIPT_DIR/refresh-token.sh"; then
    echo -e "${GREEN}✓${NC} Refresh test passed"
else
    echo -e "${RED}✗${NC} Refresh failed - check output above"
    exit 1
fi
echo ""

# Step 4: Create launchd plist
echo -e "${BLUE}[4/6]${NC} Creating launchd service..."
mkdir -p "$SCRIPT_DIR/logs"

cat > "$SCRIPT_DIR/$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${SCRIPT_DIR}/refresh-token.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>7200</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${SCRIPT_DIR}/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/logs/launchd-stderr.log</string>
    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin</string>
    </dict>
</dict>
</plist>
EOF
echo -e "${GREEN}✓${NC} Created plist"
echo ""

# Step 5: Install service
echo -e "${BLUE}[5/6]${NC} Installing launchd service..."
mkdir -p "$LAUNCHAGENTS_DIR"

if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
    launchctl unload "$LAUNCHAGENTS_DIR/$PLIST_FILE" 2>/dev/null || true
    echo "  Unloaded existing service"
fi

cp "$SCRIPT_DIR/$PLIST_FILE" "$LAUNCHAGENTS_DIR/$PLIST_FILE"
launchctl load "$LAUNCHAGENTS_DIR/$PLIST_FILE"
echo -e "${GREEN}✓${NC} Service loaded (runs every 2 hours)"
echo ""

# Step 6: Verify
echo -e "${BLUE}[6/6]${NC} Verifying..."
sleep 1
if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
    echo -e "${GREEN}✓${NC} Service is running"
else
    echo -e "${YELLOW}⚠${NC} Service may not be loaded"
fi
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo "Automatic refresh runs every 2 hours."
echo "Tokens refreshed 30 min before expiry."
echo ""
echo "Commands:"
echo "  Manual refresh: $SCRIPT_DIR/refresh-token.sh --force"
echo "  View logs:      tail -f $SCRIPT_DIR/logs/claude-oauth-refresh.log"
echo "  Check status:   launchctl list | grep jarvis"
echo "  Uninstall:      $SCRIPT_DIR/uninstall.sh"
echo "  Edit config:    $CONFIG_FILE"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
