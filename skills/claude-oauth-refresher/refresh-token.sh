#!/bin/bash
# refresh-token.sh - Claude OAuth token refresh for autoclaude/jarvis
# Cross-platform: macOS (Keychain) + Linux (~/.claude/.credentials.json)
# Usage: ./refresh-token.sh [--force]

set -euo pipefail

FORCE_REFRESH=false
if [[ "${1:-}" == "--force" ]]; then
    FORCE_REFRESH=true
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/claude-oauth-refresh-config.json"

# Defaults
DEFAULT_KEYCHAIN_SERVICE="Claude Code-credentials"
DEFAULT_CREDENTIALS_FILE="$HOME/.claude/.credentials.json"
DEFAULT_CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
DEFAULT_TOKEN_URL="https://console.anthropic.com/v1/oauth/token"
DEFAULT_REFRESH_BUFFER=30

# Detect platform
PLATFORM="linux"
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
fi

# Load config or use defaults
if [[ -f "$CONFIG_FILE" ]]; then
    REFRESH_BUFFER=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('refresh_buffer_minutes', 30))")
    LOG_FILE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('log_file', '$SCRIPT_DIR/logs/claude-oauth-refresh.log'))" | sed "s|^~|$HOME|")
    NOTIFY_START=$(python3 -c "import json; print(str(json.load(open('$CONFIG_FILE')).get('notifications', {}).get('on_start', True)).lower())")
    NOTIFY_SUCCESS=$(python3 -c "import json; print(str(json.load(open('$CONFIG_FILE')).get('notifications', {}).get('on_success', True)).lower())")
    NOTIFY_FAILURE=$(python3 -c "import json; print(str(json.load(open('$CONFIG_FILE')).get('notifications', {}).get('on_failure', True)).lower())")

    KEYCHAIN_SERVICE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('keychain_service', ''))")
    CREDENTIALS_FILE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('credentials_file', ''))" | sed "s|^~|$HOME|")
    CLIENT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('client_id', ''))")
    TOKEN_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('token_url', ''))")
else
    REFRESH_BUFFER=$DEFAULT_REFRESH_BUFFER
    LOG_FILE="$SCRIPT_DIR/logs/claude-oauth-refresh.log"
    NOTIFY_START=true
    NOTIFY_SUCCESS=true
    NOTIFY_FAILURE=true
    KEYCHAIN_SERVICE=""
    CREDENTIALS_FILE=""
    CLIENT_ID=""
    TOKEN_URL=""
fi

# Apply defaults
KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-$DEFAULT_KEYCHAIN_SERVICE}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-$DEFAULT_CREDENTIALS_FILE}"
CLIENT_ID="${CLIENT_ID:-$DEFAULT_CLIENT_ID}"
TOKEN_URL="${TOKEN_URL:-$DEFAULT_TOKEN_URL}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Load Telegram config from project .env for notifications
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

# Try project .env first
if [[ -f "$PROJECT_DIR/.env" ]]; then
    TELEGRAM_BOT_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
    TELEGRAM_CHAT_ID=$(grep -E "^TELEGRAM_ALLOWED_USERS=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- | cut -d, -f1 || true)
fi

# Override from config if present
if [[ -f "$CONFIG_FILE" ]]; then
    CFG_TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('telegram_bot_token', ''))" 2>/dev/null || true)
    CFG_CHAT=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('telegram_chat_id', ''))" 2>/dev/null || true)
    [[ -n "$CFG_TOKEN" ]] && TELEGRAM_BOT_TOKEN="$CFG_TOKEN"
    [[ -n "$CFG_CHAT" ]] && TELEGRAM_CHAT_ID="$CFG_CHAT"
fi

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Telegram notification
notify() {
    local message="$1"
    local notification_type="$2"

    case "$notification_type" in
        start)   [[ "$NOTIFY_START" != "true" ]] && return ;;
        success) [[ "$NOTIFY_SUCCESS" != "true" ]] && return ;;
        failure) [[ "$NOTIFY_FAILURE" != "true" ]] && return ;;
    esac

    if [[ -n "$TELEGRAM_BOT_TOKEN" ]] && [[ -n "$TELEGRAM_CHAT_ID" ]]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=Markdown" >> "$LOG_FILE" 2>&1 || true
    fi
}

# Error handler
error_exit() {
    local error_message="$1"
    log "ERROR: $error_message"
    notify "Claude token refresh failed: $error_message" "failure"
    exit 1
}

# ─── Main flow ───

echo "=== Claude OAuth Token Refresh ==="
log "Refresh started (platform: $PLATFORM)"

# Step 1: Read current credentials
KEYCHAIN_ACCOUNT=""

if [[ "$PLATFORM" == "macos" ]]; then
    log "Reading tokens from macOS Keychain..."

    ALL_ACCOUNTS=$(security dump-keychain 2>/dev/null | \
        awk '/^class: "genp"/,/^keychain:/ {
            if (/"acct"<blob>=/) {
                gsub(/.*"acct"<blob>="/, "");
                gsub(/".*/, "");
                account=$0
            }
            if (/"svce"<blob>="'"$KEYCHAIN_SERVICE"'"/) {
                print account
            }
        }' | sort -u)

    if [[ -z "$ALL_ACCOUNTS" ]]; then
        error_exit "No '$KEYCHAIN_SERVICE' entries found in Keychain. Run: claude auth"
    fi

    log "Found $(echo "$ALL_ACCOUNTS" | wc -l | tr -d ' ') keychain entry/entries"

    CRED_DATA=""
    while IFS= read -r account; do
        [[ -z "$account" ]] && continue
        log "Checking account: $account"
        TEMP_DATA=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$account" -w 2>&1 || echo "")

        if [[ -n "$TEMP_DATA" ]]; then
            HAS_REFRESH=$(echo "$TEMP_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'refreshToken' in data and data['refreshToken']:
    print('flat')
elif 'claudeAiOauth' in data and 'refreshToken' in data['claudeAiOauth'] and data['claudeAiOauth']['refreshToken']:
    print('nested')
else:
    print('no')
" 2>/dev/null || echo "no")

            if [[ "$HAS_REFRESH" != "no" ]]; then
                CRED_DATA="$TEMP_DATA"
                KEYCHAIN_ACCOUNT="$account"
                log "Found valid OAuth tokens (structure: $HAS_REFRESH) in account: $account"
                break
            fi
        fi
    done <<< "$ALL_ACCOUNTS"

    if [[ -z "$CRED_DATA" ]]; then
        error_exit "No keychain entry has valid OAuth tokens. Run: claude auth"
    fi
else
    log "Reading tokens from $CREDENTIALS_FILE..."
    if [[ ! -f "$CREDENTIALS_FILE" ]]; then
        error_exit "Credentials file not found: $CREDENTIALS_FILE. Run: claude auth"
    fi
    CRED_DATA=$(cat "$CREDENTIALS_FILE")
fi

# Parse tokens - handle both flat and nested structures
PARSE_RESULT=$(echo "$CRED_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'claudeAiOauth' in data and 'refreshToken' in data['claudeAiOauth']:
    oauth = data['claudeAiOauth']
    structure = 'nested'
else:
    oauth = data
    structure = 'flat'
print(json.dumps({
    'structure': structure,
    'refreshToken': oauth['refreshToken'],
    'expiresAt': oauth['expiresAt'],
    'scopes': oauth.get('scopes', []),
    'subscriptionType': oauth.get('subscriptionType', 'max'),
    'rateLimitTier': oauth.get('rateLimitTier', 'default')
}))
")

STRUCTURE=$(echo "$PARSE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['structure'])")
REFRESH_TOKEN=$(echo "$PARSE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['refreshToken'])")
CURRENT_EXPIRES=$(echo "$PARSE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['expiresAt'])")
SCOPES_JSON=$(echo "$PARSE_RESULT" | python3 -c "import sys, json; import json as j; print(j.dumps(json.load(sys.stdin)['scopes']))")
SUB_TYPE=$(echo "$PARSE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['subscriptionType'])")
RATE_TIER=$(echo "$PARSE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['rateLimitTier'])")

log "Token structure: $STRUCTURE"

# date -r works differently on Linux vs macOS
if [[ "$PLATFORM" == "macos" ]]; then
    log "Current expiry: $(date -r $((CURRENT_EXPIRES / 1000)) '+%Y-%m-%d %H:%M:%S')"
else
    log "Current expiry: $(date -d @$((CURRENT_EXPIRES / 1000)) '+%Y-%m-%d %H:%M:%S')"
fi

# Check if refresh needed
NOW_MS=$(($(date +%s) * 1000))
TIME_LEFT_MS=$((CURRENT_EXPIRES - NOW_MS))
TIME_LEFT_MIN=$((TIME_LEFT_MS / 60000))

if [[ "$FORCE_REFRESH" == "false" ]] && [[ $TIME_LEFT_MIN -gt $REFRESH_BUFFER ]]; then
    log "Token still valid for ${TIME_LEFT_MIN} minutes (buffer: ${REFRESH_BUFFER}m)"
    echo "Token still valid ($TIME_LEFT_MIN minutes remaining). Use --force to refresh anyway."
    exit 0
fi

if [[ "$FORCE_REFRESH" == "true" ]]; then
    log "Force refresh requested (token expires in $TIME_LEFT_MIN minutes)"
else
    log "Token expires in $TIME_LEFT_MIN minutes, refreshing..."
fi

notify "Refreshing Claude token... (expires in ${TIME_LEFT_MIN}m)" "start"

# Step 2: Call OAuth endpoint
log "Calling OAuth endpoint..."
RESPONSE=$(curl -s -X POST "$TOKEN_URL" \
    -H "Content-Type: application/json" \
    --max-time 30 \
    -d "{
        \"grant_type\": \"refresh_token\",
        \"refresh_token\": \"$REFRESH_TOKEN\",
        \"client_id\": \"$CLIENT_ID\"
    }") || error_exit "Network error calling OAuth endpoint"

# Parse response
NEW_ACCESS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null) || \
    error_exit "Failed to parse OAuth response"
NEW_REFRESH=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('refresh_token', ''))" 2>/dev/null) || \
    error_exit "Failed to parse OAuth response"
EXPIRES_IN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('expires_in', 0))" 2>/dev/null) || \
    error_exit "Failed to parse OAuth response"

[[ -n "$NEW_ACCESS" ]] || error_exit "No access_token in response: $(echo "$RESPONSE" | head -c 200)"
[[ -n "$NEW_REFRESH" ]] || error_exit "No refresh_token in response"

NEW_EXPIRES_AT=$(($(date +%s) * 1000 + EXPIRES_IN * 1000))

if [[ "$PLATFORM" == "macos" ]]; then
    NEW_EXPIRES_TIME=$(date -r $((NEW_EXPIRES_AT / 1000)) '+%Y-%m-%d %H:%M:%S')
else
    NEW_EXPIRES_TIME=$(date -d @$((NEW_EXPIRES_AT / 1000)) '+%Y-%m-%d %H:%M:%S')
fi

log "Received new tokens (expires: $NEW_EXPIRES_TIME, ${EXPIRES_IN}s / $((EXPIRES_IN / 3600))h)"

# Step 3: Build updated credential data
NEW_CRED_DATA=$(python3 << PYEOF
import json

oauth_data = {
    'accessToken': '$NEW_ACCESS',
    'refreshToken': '$NEW_REFRESH',
    'expiresAt': $NEW_EXPIRES_AT,
    'scopes': $SCOPES_JSON,
    'subscriptionType': '$SUB_TYPE',
    'rateLimitTier': '$RATE_TIER'
}

structure = '$STRUCTURE'
if structure == 'nested':
    data = {'claudeAiOauth': oauth_data}
else:
    data = oauth_data

print(json.dumps(data))
PYEOF
)

# Step 4: Write credentials (platform-specific)
if [[ "$PLATFORM" == "macos" ]]; then
    log "Updating macOS Keychain..."
    security delete-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" 2>/dev/null || true
    security add-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w "$NEW_CRED_DATA" -U
    log "Keychain updated"
else
    log "Updating $CREDENTIALS_FILE..."
    TMP_CRED="${CREDENTIALS_FILE}.tmp"
    printf '%s' "$NEW_CRED_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
with open('${TMP_CRED}', 'w') as f:
    json.dump(data, f, indent=2)
"
    chmod 600 "$TMP_CRED"
    mv "$TMP_CRED" "$CREDENTIALS_FILE"
    log "Credentials file updated"
fi

log "Refresh complete"

notify "Claude token refreshed!
Expires: $NEW_EXPIRES_TIME (~$((EXPIRES_IN / 3600))h)" "success"

echo ""
echo "Token refreshed successfully!"
echo "New expiry: $NEW_EXPIRES_TIME ($((EXPIRES_IN / 3600)) hours)"
