#!/bin/bash
# install.sh - One-time setup for claude-oauth-refresher (autoclaude/jarvis)
# Cross-platform: launchd (macOS) or systemd timer (Linux)

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

PLATFORM="linux"
[[ "$OSTYPE" == "darwin"* ]] && PLATFORM="macos"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  claude-oauth-refresher installer${NC}"
echo -e "${BLUE}  (for autoclaude/jarvis - $PLATFORM)${NC}"
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

# Step 4-6: Platform-specific scheduler setup
mkdir -p "$SCRIPT_DIR/logs"

if [[ "$PLATFORM" == "macos" ]]; then
    # ─── macOS: launchd ───
    PLIST_LABEL="com.jarvis.claude-oauth-refresher"
    PLIST_FILE="${PLIST_LABEL}.plist"
    LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

    echo -e "${BLUE}[4/6]${NC} Creating launchd service..."
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

    echo -e "${BLUE}[6/6]${NC} Verifying..."
    sleep 1
    if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
        echo -e "${GREEN}✓${NC} Service is running"
    else
        echo -e "${YELLOW}⚠${NC} Service may not be loaded"
    fi

else
    # ─── Linux: systemd user timer ───
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    SERVICE_NAME="claude-oauth-refresher"

    echo -e "${BLUE}[4/6]${NC} Creating systemd service + timer..."
    mkdir -p "$SYSTEMD_DIR"

    cat > "$SYSTEMD_DIR/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Claude OAuth Token Refresher
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/refresh-token.sh
WorkingDirectory=${SCRIPT_DIR}
Environment=PATH=/usr/local/bin:/usr/bin:/bin:%h/.local/bin

[Install]
WantedBy=default.target
EOF

    cat > "$SYSTEMD_DIR/${SERVICE_NAME}.timer" << EOF
[Unit]
Description=Refresh Claude OAuth tokens every 2 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=2h
Persistent=true

[Install]
WantedBy=timers.target
EOF
    echo -e "${GREEN}✓${NC} Created service + timer"
    echo ""

    echo -e "${BLUE}[5/6]${NC} Enabling systemd timer..."
    systemctl --user daemon-reload
    systemctl --user enable "${SERVICE_NAME}.timer"
    systemctl --user start "${SERVICE_NAME}.timer"
    echo -e "${GREEN}✓${NC} Timer enabled (runs every 2 hours)"
    echo ""

    echo -e "${BLUE}[6/6]${NC} Verifying..."
    if systemctl --user is-active "${SERVICE_NAME}.timer" &>/dev/null; then
        echo -e "${GREEN}✓${NC} Timer is active"
        systemctl --user list-timers "${SERVICE_NAME}.timer" --no-pager 2>/dev/null || true
    else
        echo -e "${YELLOW}⚠${NC} Timer may not be active"
    fi
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
if [[ "$PLATFORM" == "macos" ]]; then
    echo "  Check status:   launchctl list | grep jarvis"
else
    echo "  Check status:   systemctl --user status claude-oauth-refresher.timer"
fi
echo "  Uninstall:      $SCRIPT_DIR/uninstall.sh"
echo "  Edit config:    $CONFIG_FILE"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
